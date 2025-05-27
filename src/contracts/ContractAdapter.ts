import { CouchDBAdapter, MangoQuery } from "@decaf-ts/for-couchdb";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { FabricContractFlavour } from "./constants";
import { FabricContractFlags } from "./types";
import { FabricContractContext } from "./ContractContext";
import { OperationKeys, SerializationError } from "@decaf-ts/db-decorators";
import { Context as Ctx } from "fabric-contract-api";
import { debug, Logger, Logging } from "@decaf-ts/logging";
import { ContractLogger } from "./logging";
import { Repository } from "@decaf-ts/core";
import { FabricContractRepository } from "./FabricContractRepository";
import { Iterators, StateQueryResponse } from "fabric-shim-api";
import { FabricContractRepositoryObservableHandler } from "./FabricContractRepositoryObservableHandler";

export class FabricContractAdapter extends CouchDBAdapter<
  void,
  FabricContractFlags,
  FabricContractContext
> {
  private static textDecoder = new TextDecoder("utf8");

  private logFor(ctx: Ctx): ContractLogger {
    return Logging.for(FabricContractAdapter, {}, ctx) as ContractLogger;
  }

  override Context: Constructor<FabricContractContext> = FabricContractContext;

  override repository<M extends Model>(): Constructor<
    Repository<
      M,
      MangoQuery,
      FabricContractAdapter,
      FabricContractFlags,
      FabricContractContext
    >
  > {
    return FabricContractRepository;
  }

  constructor(scope: void, alias?: string) {
    super(scope, FabricContractFlavour, alias);
  }

  protected decode(buffer: Uint8Array) {
    return FabricContractAdapter.textDecoder.decode(buffer);
  }

  protected override flags<M extends Model>(
    operation: OperationKeys,
    model: Constructor<M>,
    flags: Partial<FabricContractFlags>,
    ctx: Ctx
  ): FabricContractFlags {
    return Object.assign(super.flags(operation, model, flags), {
      stub: ctx.stub,
      identity: ctx.clientIdentity,
      logger: this.logFor(ctx),
    });
  }

  @debug(true)
  async create(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    transient: Record<string, any>,
    ...args: any[]
  ): Promise<Record<string, any>> {
    const { stub, logger } = args.pop();
    const log = logger.for(this.create);
    let data: Buffer;
    try {
      data = Buffer.from(JSON.stringify(model));
    } catch (e: unknown) {
      throw new SerializationError(
        `Failed to serialize record with id ${id} for table ${tableName}: ${e}`
      );
    }

    log.info(`adding entry to ${tableName} table with pk ${id}`);

    try {
      await stub.putState(id.toString(), data);
    } catch (e: unknown) {
      throw this.parseError(e as Error);
    }

    return model;
  }

  async delete(
    tableName: string,
    id: string | number,
    ...args: any[]
  ): Promise<Record<string, any>> {
    const { stub, logger } = args.pop();
    const log = logger.for(this.delete);

    let model: Record<string, any>;
    try {
      model = JSON.parse(await stub.getState(id.toString()));
      log.verbose(`deleting entry with pk ${id} from ${tableName} table`);
      await stub.deleteState(id.toString());
    } catch (e: unknown) {
      throw this.parseError(e as Error);
    }

    return model;
  }

  protected index<M>(models: Constructor<M>): Promise<void> {
    return Promise.resolve(undefined);
  }

  async read(
    tableName: string,
    id: string | number,
    ...args: any[]
  ): Promise<Record<string, any>> {
    const { stub, logger } = args.pop();
    const log = logger.for(this.read);

    let model: Record<string, any>;
    try {
      log.verbose(`retrieving entry with pk ${id} from ${tableName} table`);
      model = JSON.parse(await stub.getState(id.toString()));
    } catch (e: unknown) {
      throw this.parseError(e as Error);
    }

    return model;
  }

  async update(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    transient: Record<string, any>,
    ...args: any[]
  ): Promise<Record<string, any>> {
    const { stub, logger } = args.pop();
    const log = logger.for(this.create);
    let data: Buffer;
    try {
      data = Buffer.from(JSON.stringify(model));
    } catch (e: unknown) {
      throw new SerializationError(
        `Failed to serialize record with id ${id} for table ${tableName}: ${e}`
      );
    }

    log.info(`adding entry to ${tableName} table with pk ${id}`);

    try {
      await stub.putState(id.toString(), data);
    } catch (e: unknown) {
      throw this.parseError(e as Error);
    }

    return model;
  }

  protected async resultIterator(
    log: Logger,
    iterator: Iterators.StateQueryIterator,
    isHistory = false
  ) {
    const allResults = [];
    let res: { value: any; done: boolean } = await iterator.next();
    while (!res.done) {
      if (res.value && res.value.value.toString()) {
        const jsonRes: any = {};
        log.debug(res.value.value.toString("utf8"));
        if (isHistory /* && isHistory === true*/) {
          jsonRes.TxId = res.value.txId;
          jsonRes.Timestamp = res.value.timestamp;
          try {
            jsonRes.Value = JSON.parse(res.value.value.toString("utf8"));
          } catch (err: any) {
            log.error(err);
            jsonRes.Value = res.value.value.toString("utf8");
          }
        } else {
          jsonRes.Key = res.value.key;
          try {
            jsonRes.Record = JSON.parse(res.value.value.toString("utf8"));
          } catch (err: any) {
            log.error(err);
            jsonRes.Record = res.value.value.toString("utf8");
          }
        }
        allResults.push(jsonRes);
      }
      res = await iterator.next();
    }
    log.debug(`Closing iterator after ${allResults.length} results`);
    iterator.close(); // purposely not await. let iterator close on its own
    return allResults;
  }

  async raw<R>(
    rawInput: MangoQuery,
    docsOnly: boolean,
    ...args: any[]
  ): Promise<R> {
    const { stub, logger } = args.pop();
    const log = logger.for(this.raw);
    const { skip, limit } = rawInput;
    let iterator: Iterators.StateQueryIterator;
    if (limit || skip) {
      delete rawInput["limit"];
      delete rawInput["skip"];
      log.debug(
        `Retrieving paginated iterator: limit: ${limit}/ skip: ${skip}`
      );
      const response: StateQueryResponse<Iterators.StateQueryIterator> =
        (await stub.getQueryResultWithPagination(
          JSON.stringify(rawInput),
          limit || 250,
          skip?.toString()
        )) as StateQueryResponse<Iterators.StateQueryIterator>;
      iterator = response.iterator;
    } else {
      log.debug("Retrieving iterator");
      iterator = (await stub.getQueryResult(
        JSON.stringify(rawInput)
      )) as Iterators.StateQueryIterator;
    }
    log.debug("Iterator acquired");

    const results = (await this.resultIterator(log, iterator)) as R;
    log.debug(
      `returning {0} results`,
      `${Array.isArray(results) ? results.length : 1}`
    );
    return results;
  }

  static decoration() {}
}

FabricContractAdapter.decoration();
