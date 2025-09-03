import { CouchDBAdapter, CouchDBKeys, MangoQuery } from "@decaf-ts/for-couchdb";
import {
  Constructor,
  Decoration,
  Model,
  propMetadata,
  required,
} from "@decaf-ts/decorator-validation";
import { FabricContractFlavour } from "./constants";
import { FabricContractFlags } from "./types";
import { FabricContractContext } from "./ContractContext";
import {
  ConflictError,
  Context,
  DBKeys,
  InternalError,
  modelToTransient,
  NotFoundError,
  onCreate,
  onCreateUpdate,
  OperationKeys,
  readonly,
  SerializationError,
} from "@decaf-ts/db-decorators";
import { Context as Ctx } from "fabric-contract-api";
import { debug, Logger, Logging } from "@decaf-ts/logging";
import { ContractLogger } from "./logging";
import {
  OrderDirection,
  PersistenceKeys,
  RelationsMetadata,
  Repository,
  Sequence,
  sequenceNameForModel,
  SequenceOptions,
  UnsupportedError,
  index,
  NumericSequence,
  Adapter,
} from "@decaf-ts/core";
import { FabricContractRepository } from "./FabricContractRepository";
import { ClientIdentity, Iterators, StateQueryResponse } from "fabric-shim-api";
import { FabricStatement } from "./erc20/Statement";
import { FabricContractDBSequence } from "./FabricContractSequence";
import { MissingContextError } from "../shared/errors";

/**
 * @description Sets the creator or updater field in a model based on the user in the context
 * @summary Callback function used in decorators to automatically set the created_by or updated_by fields
 * with the username from the context when a document is created or updated
 * @template M - Type extending Model
 * @template R - Type extending NanoRepository<M>
 * @template V - Type extending RelationsMetadata
 * @param {R} this - The repository instance
 * @param {Context<NanoFlags>} context - The operation context containing user information
 * @param {V} data - The relation metadata
 * @param key - The property key to set with the username
 * @param {M} model - The model instance being created or updated
 * @return {Promise<void>} A promise that resolves when the operation is complete
 * @function createdByOnNanoCreateUpdate
 * @memberOf module:for-nano
 * @mermaid
 * sequenceDiagram
 *   participant F as createdByOnNanoCreateUpdate
 *   participant C as Context
 *   participant M as Model
 *   F->>C: get("user")
 *   C-->>F: user object
 *   F->>M: set key to user.name
 *   Note over F: If no user in context
 *   F-->>F: throw UnsupportedError
 */
export async function createdByOnFabricCreateUpdate<
  M extends Model,
  R extends FabricContractRepository<M>,
  V extends RelationsMetadata,
>(
  this: R,
  context: Context<FabricContractFlags>,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  try {
    const user = context.get("clientIdentity") as ClientIdentity;
    model[key] = user.getID() as M[typeof key];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e: unknown) {
    throw new UnsupportedError(
      "No User found in context. Please provide a user in the context"
    );
  }
}

export async function pkFabricOnCreate<
  M extends Model,
  R extends FabricContractRepository<M>,
  V extends SequenceOptions,
  F extends FabricContractFlags,
>(
  this: R,
  context: Context<F>,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  if (!data.type || model[key]) {
    return;
  }

  const setPrimaryKeyValue = function <M extends Model>(
    target: M,
    propertyKey: string,
    value: string | number | bigint
  ) {
    Object.defineProperty(target, propertyKey, {
      enumerable: true,
      writable: false,
      configurable: true,
      value: value,
    });
  };
  if (!data.name) data.name = sequenceNameForModel(model, "pk");
  let sequence: FabricContractDBSequence;
  try {
    sequence = (await this.adapter.Sequence(data)) as FabricContractDBSequence;
  } catch (e: any) {
    throw new InternalError(
      `Failed to instantiate Sequence ${data.name}: ${e}`
    );
  }

  const next = await sequence.next(context as FabricContractContext);
  setPrimaryKeyValue(model, key as string, next);
}

/**
 * @description Adapter for Hyperledger Fabric chaincode state database operations
 * @summary Provides a CouchDB-like interface for interacting with the Fabric state database from within a chaincode contract
 * @template void - No configuration needed for contract adapter
 * @template FabricContractFlags - Flags specific to Fabric contract operations
 * @template FabricContractContext - Context type for Fabric contract operations
 * @class FabricContractAdapter
 * @example
 * ```typescript
 * // In a Fabric chaincode contract class
 * import { FabricContractAdapter } from '@decaf-ts/for-fabric';
 *
 * export class MyContract extends Contract {
 *   private adapter = new FabricContractAdapter();
 *
 *   @Transaction()
 *   async createAsset(ctx: Context, id: string, data: string): Promise<void> {
 *     const model = { id, data, timestamp: Date.now() };
 *     await this.adapter.create('assets', id, model, {}, { stub: ctx.stub });
 *   }
 * }
 * ```
 * @mermaid
 * sequenceDiagram
 *   participant Contract
 *   participant FabricContractAdapter
 *   participant Stub
 *   participant StateDB
 *
 *   Contract->>FabricContractAdapter: create(tableName, id, model, transient, ctx)
 *   FabricContractAdapter->>FabricContractAdapter: Serialize model to JSON
 *   FabricContractAdapter->>Stub: putState(id, serializedData)
 *   Stub->>StateDB: Write data
 *   StateDB-->>Stub: Success
 *   Stub-->>FabricContractAdapter: Success
 *   FabricContractAdapter-->>Contract: model
 */
export class FabricContractAdapter extends CouchDBAdapter<
  void,
  FabricContractFlags,
  FabricContractContext
> {
  /**
   * @description Text decoder for converting binary data to strings
   */
  private static textDecoder = new TextDecoder("utf8");

  /**
   * @description Creates a logger for a specific chaincode context
   * @summary Returns a ContractLogger instance configured for the current context
   * @param {Ctx} ctx - The Fabric chaincode context
   * @return {ContractLogger} The logger instance
   */
  public logFor(ctx: Ctx): ContractLogger {
    return Logging.for(FabricContractAdapter, {}, ctx) as ContractLogger;
  }

  /**
   * @description Context constructor for this adapter
   * @summary Overrides the base Context constructor with FabricContractContext
   */
  override Context: Constructor<FabricContractContext> = FabricContractContext;

  /**
   * @description Gets the repository constructor for this adapter
   * @summary Returns the FabricContractRepository constructor for creating repositories
   * @template M - Type extending Model
   * @return {Constructor<Repository<M, MangoQuery, FabricContractAdapter, FabricContractFlags, FabricContractContext>>} The repository constructor
   */
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

  /**
   * @description Creates a new FabricContractAdapter instance
   * @summary Initializes an adapter for interacting with the Fabric state database
   * @param {void} scope - Not used in this adapter
   * @param {string} [alias] - Optional alias for the adapter instance
   */
  constructor(scope: void, alias?: string) {
    super(scope, FabricContractFlavour, alias);
  }

  /**
   * @description Decodes binary data to string
   * @summary Converts a Uint8Array to a string using UTF-8 encoding
   * @param {Uint8Array} buffer - The binary data to decode
   * @return {string} The decoded string
   */
  protected decode(buffer: Uint8Array) {
    return FabricContractAdapter.textDecoder.decode(buffer);
  }

  /**
   * @description Creates operation flags for Fabric contract operations
   * @summary Merges default flags with Fabric-specific context information
   * @template M - Type extending Model
   * @param {OperationKeys} operation - The operation being performed
   * @param {Constructor<M>} model - The model constructor
   * @param {Partial<FabricContractFlags>} flags - Partial flags to merge with defaults
   * @param {Ctx} ctx - The Fabric chaincode context
   * @return {FabricContractFlags} The merged flags
   */
  protected override async flags<M extends Model>(
    operation: OperationKeys,
    model: Constructor<M>,
    flags: Partial<FabricContractFlags>,
    ctx: Ctx,
    ...args: any[]
  ): Promise<FabricContractFlags> {
    return Object.assign(await super.flags(operation, model, flags, ...args), {
      stub: ctx.stub,
      identity: ctx.clientIdentity,
      logger: this.logFor(ctx),
    });
  }

  /**
   * @description Creates an index for a model
   * @summary This method is not implemented for Fabric contracts and returns a resolved promise
   * @template M - Type extending Model
   * @param {Constructor<M>} models - The model constructor
   * @return {Promise<void>} Promise that resolves immediately
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected index<M>(models: Constructor<M>): Promise<void> {
    return Promise.resolve(undefined);
  }

  /**
   * @description Processes results from a state query iterator
   * @summary Iterates through query results and converts them to a structured format
   * @param {Logger} log - Logger instance for debugging
   * @param {Iterators.StateQueryIterator} iterator - The state query iterator
   * @param {boolean} [isHistory=false] - Whether this is a history query
   * @return {Promise<any[]>} Promise resolving to an array of processed results
   * @mermaid
   * sequenceDiagram
   *   participant Caller
   *   participant ResultIterator
   *   participant Iterator
   *
   *   Caller->>ResultIterator: resultIterator(log, iterator, isHistory)
   *   loop Until done
   *     ResultIterator->>Iterator: next()
   *     Iterator-->>ResultIterator: { value, done }
   *     alt Has value
   *       ResultIterator->>ResultIterator: Process value based on isHistory
   *       ResultIterator->>ResultIterator: Add to results array
   *     end
   *   end
   *   ResultIterator->>Iterator: close()
   *   ResultIterator-->>Caller: allResults
   */
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

  /**
   * @description Executes a raw query against the state database
   * @summary Performs a rich query using CouchDB syntax against the Fabric state database
   * @template R - The return type
   * @param {MangoQuery} rawInput - The Mango Query to execute
   * @param {boolean} docsOnly - Whether to return only documents (not used in this implementation)
   * @param {...any[]} args - Additional arguments, including the chaincode stub and logger
   * @return {Promise<R>} Promise resolving to the query results
   * @mermaid
   * sequenceDiagram
   *   participant Caller
   *   participant FabricContractAdapter
   *   participant Stub
   *   participant StateDB
   *
   *   Caller->>FabricContractAdapter: raw(rawInput, docsOnly, ctx)
   *   FabricContractAdapter->>FabricContractAdapter: Extract limit and skip
   *   alt With pagination
   *     FabricContractAdapter->>Stub: getQueryResultWithPagination(query, limit, skip)
   *   else Without pagination
   *     FabricContractAdapter->>Stub: getQueryResult(query)
   *   end
   *   Stub->>StateDB: Execute query
   *   StateDB-->>Stub: Iterator
   *   Stub-->>FabricContractAdapter: Iterator
   *   FabricContractAdapter->>FabricContractAdapter: resultIterator(log, iterator)
   *   FabricContractAdapter-->>Caller: results
   */
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

  override Statement<M extends Model>(
    ctx?: FabricContractContext
  ): FabricStatement<M, any> {
    if (!ctx) {
      throw new MissingContextError("Context is required");
    }
    return new FabricStatement(this, ctx);
  }

  override async Sequence(options: SequenceOptions): Promise<Sequence> {
    return new FabricContractDBSequence(
      options,
      this as unknown as CouchDBAdapter<
        void,
        FabricContractFlags,
        FabricContractContext
      >
    );
  }

  /**
   * @description Static method for class decoration
   * @summary Empty method used for class decoration purposes
   */
  static override decoration() {
    super.decoration();
    const createdByKey = Repository.key(PersistenceKeys.CREATED_BY);
    const updatedByKey = Repository.key(PersistenceKeys.UPDATED_BY);
    Decoration.flavouredAs(FabricContractFlavour)
      .for(createdByKey)
      .define(
        onCreate(createdByOnFabricCreateUpdate),
        propMetadata(createdByKey, {})
      )
      .apply();

    Decoration.flavouredAs(FabricContractFlavour)
      .for(updatedByKey)
      .define(
        onCreateUpdate(createdByOnFabricCreateUpdate),
        propMetadata(updatedByKey, {})
      )
      .apply();

    const pkKey = Repository.key(DBKeys.ID);
    Decoration.flavouredAs(FabricContractFlavour)
      .for(pkKey)
      .define(
        index([OrderDirection.ASC, OrderDirection.DSC]),
        required(),
        readonly(),
        // type([String.name, Number.name, BigInt.name]),
        propMetadata(pkKey, NumericSequence),
        onCreate(pkFabricOnCreate, NumericSequence)
      )
      .apply();
  }

  /**
   * @description Creates a record in the state database
   * @summary Serializes a model and stores it in the Fabric state database
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The record identifier
   * @param {Record<string, any>} model - The record data
   * @param {Record<string, any>} transient - Transient data (not used in this implementation)
   * @param {...any[]} args - Additional arguments, including the chaincode stub and logger
   * @return {Promise<Record<string, any>>} Promise resolving to the created record
   */
  @debug(true)
  override async create(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
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

    try {
      log.info(
        `Checking if entry with id ${id} already exists in ${tableName} table`
      );
      const res = await stub.getState(id.toString());
      if (res.toString() !== "") {
        log.info(`Entry with id ${id} already exists in ${tableName} table`);
        throw new ConflictError(
          `Entry with id ${id} already exists in ${tableName} table`
        );
      }
      log.info(`adding entry to ${tableName} table with pk ${id}`);
      await stub.putState(id.toString(), data);
    } catch (e: unknown) {
      throw this.parseError(e as Error);
    }

    return model;
  }

  override async createAll(
    tableName: string,
    id: (string | number)[],
    model: Record<string, any>[],
    ...args: any[]
  ): Promise<Record<string, any>[]> {
    if (id.length !== model.length)
      throw new InternalError("Ids and models must have the same length");

    const { logger } = args[args.length - 1] as FabricContractContext;
    const log = logger.for(this.createAll);
    log.info(`Creating ${id.length} entries ${tableName} table`);
    log.debug(`pks: ${id}`);

    return Promise.all(
      id.map(async (i, index) => {
        return this.create(tableName, i, model[index], ...args);
      })
    );
  }

  /**
   * @description Reads a record from the state database
   * @summary Retrieves and deserializes a record from the Fabric state database
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The record identifier
   * @param {...any[]} args - Additional arguments, including the chaincode stub and logger
   * @return {Promise<Record<string, any>>} Promise resolving to the retrieved record
   */
  override async read(
    tableName: string,
    id: string | number,
    ...args: any[]
  ): Promise<Record<string, any>> {
    const { stub, logger } = args.pop();
    const log = logger.for(this.read);

    let model: Record<string, any>;
    const composedKey = stub.createCompositeKey(tableName, [String(id)]);
    try {
      log.verbose(
        `retrieving entry with pk ${composedKey} from ${tableName} table`
      );
      const res = await stub.getState(composedKey);
      const resStr = res.toString();

      if (resStr === "" || resStr === "null" || resStr === "undefined") {
        throw new NotFoundError(
          `The record with id ${id} does not exist in table ${tableName}`
        );
      }

      model = JSON.parse(res.toString());
    } catch (e: unknown) {
      throw this.parseError(e as Error);
    }

    return model;
  }

  /**
   * @description Updates a record in the state database
   * @summary Serializes a model and updates it in the Fabric state database
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The record identifier
   * @param {Record<string, any>} model - The updated record data
   * @param {Record<string, any>} transient - Transient data (not used in this implementation)
   * @param {...any[]} args - Additional arguments, including the chaincode stub and logger
   * @return {Promise<Record<string, any>>} Promise resolving to the updated record
   */
  override async update(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    ...args: any[]
  ): Promise<Record<string, any>> {
    const { stub, logger } = args.pop();
    const log = logger.for(this.update);
    let data: Buffer;
    try {
      data = Buffer.from(JSON.stringify(model));
    } catch (e: unknown) {
      throw new SerializationError(
        `Failed to serialize record with id ${id} for table ${tableName}: ${e}`
      );
    }

    try {
      log.info(`Checking if entry with id ${id} exists in ${tableName} table`);
      const res = await stub.getState(id.toString());
      if (res.toString() === "") {
        log.info(`Entry with id ${id} already exists in ${tableName} table`);
        throw new ConflictError(
          `Entry with id ${id} doesn't exist in ${tableName} table`
        );
      }
      log.info(`updating entry to ${tableName} table with pk ${id}`);
      await stub.putState(id.toString(), data);
    } catch (e: unknown) {
      throw this.parseError(e as Error);
    }

    return model;
  }

  override async updateAll(
    tableName: string,
    id: string[] | number[],
    model: Record<string, any>[],
    ...args: any[]
  ): Promise<Record<string, any>[]> {
    if (id.length !== model.length)
      throw new InternalError("Ids and models must have the same length");

    const { logger } = args[args.length - 1] as FabricContractContext;

    const log = logger.for(this.createAll);
    log.info(`Updating ${id.length} entries ${tableName} table`);
    log.debug(`pks: ${id}`);

    return Promise.all(
      id.map(async (i, index) => {
        return this.update(tableName, i, model[index], ...args);
      })
    );
  }

  /**
   * @description Deletes a record from the state database
   * @summary Retrieves a record and then removes it from the Fabric state database
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The record identifier to delete
   * @param {...any[]} args - Additional arguments, including the chaincode stub and logger
   * @return {Promise<Record<string, any>>} Promise resolving to the deleted record
   */
  async delete(
    tableName: string,
    id: string | number,
    ...args: any[]
  ): Promise<Record<string, any>> {
    const { stub, logger } = args.pop();
    const log = logger.for(this.delete);

    let model: Record<string, any>;
    const composedKey = stub.createCompositeKey(tableName, [String(id)]);
    try {
      model = JSON.parse(await stub.getState(composedKey));
      log.verbose(`deleting entry with pk ${id} from ${tableName} table`);
      await stub.deleteState(composedKey);
    } catch (e: unknown) {
      throw this.parseError(e as Error);
    }

    return model;
  }

  override prepare<M extends Model>(
    model: M,
    pk: keyof M,
    ...args: any[]
  ): {
    record: Record<string, any>;
    id: string;
    transient?: Record<string, any>;
  } {
    const { stub, logger } = args.pop();
    const tableName = args.shift();
    const log = logger.for(this.prepare);

    const split = modelToTransient(model);
    const result = Object.entries(split.model).reduce(
      (accum: Record<string, any>, [key, val]) => {
        if (typeof val === "undefined") return accum;
        const mappedProp = Repository.column(model, key);
        if (this.isReserved(mappedProp))
          throw new InternalError(`Property name ${mappedProp} is reserved`);
        accum[mappedProp] = val;
        return accum;
      },
      {}
    );
    if ((model as any)[PersistenceKeys.METADATA]) {
      log.silly(
        `Passing along persistence metadata for ${(model as any)[PersistenceKeys.METADATA]}`
      );
      Object.defineProperty(result, PersistenceKeys.METADATA, {
        enumerable: false,
        writable: false,
        configurable: true,
        value: (model as any)[PersistenceKeys.METADATA],
      });
    }

    log.info(`Preparing record for ${tableName} table with pk ${model[pk]}`);

    return {
      record: result,
      id: stub.createCompositeKey(tableName, [String(model[pk])]),
      transient: split.transient,
    };
  }

  override updatePrefix(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    ...args: any[]
  ): (string | number | Record<string, any>)[] {
    const ctx: FabricContractContext = args.pop();
    const record: Record<string, any> = {};
    record[CouchDBKeys.TABLE] = tableName;
    // record[CouchDBKeys.ID] = this.generateId(tableName, id);
    Object.assign(record, model);
    return [tableName, id, record, ctx];
  }

  protected override createAllPrefix(
    tableName: string,
    ids: string[] | number[],
    models: Record<string, any>[],
    ...args: any[]
  ): (string | string[] | number[] | Record<string, any>[])[] {
    if (ids.length !== models.length)
      throw new InternalError("Ids and models must have the same length");

    const ctx: FabricContractContext = args.pop();

    const records = ids.map((id, count) => {
      const record: Record<string, any> = {};
      record[CouchDBKeys.TABLE] = tableName;
      // record[CouchDBKeys.ID] = this.generateId(tableName, id);
      Object.assign(record, models[count]);
      return record;
    });
    return [tableName, ids, records, ctx as any];
  }

  protected override updateAllPrefix(
    tableName: string,
    ids: string[] | number[],
    models: Record<string, any>[],
    ...args: any[]
  ) {
    if (ids.length !== models.length)
      throw new InternalError("Ids and models must have the same length");

    const ctx: FabricContractContext = args.pop();

    const records = ids.map((id, count) => {
      const record: Record<string, any> = {};
      record[CouchDBKeys.TABLE] = tableName;
      Object.assign(record, models[count]);
      return record;
    });
    return [tableName, ids, records, ctx as any];
  }
}

FabricContractAdapter.decoration();
Adapter.setCurrent(FabricContractFlavour);
