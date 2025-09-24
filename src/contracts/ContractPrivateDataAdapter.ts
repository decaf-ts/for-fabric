import { ChaincodeStub } from "fabric-shim";
import { FabricContractAdapter } from "./ContractAdapter";
import {
  BaseError,
  NotFoundError,
  SerializationError,
} from "@decaf-ts/db-decorators";
import { Model } from "@decaf-ts/decorator-validation";
import {
  MISSING_PRIVATE_DATA_REGEX,
  modelToPrivate,
  processModel,
} from "./private-data";
import { UnauthorizedPrivateDataAccess } from "../shared/errors";
import { FabricContractSequence } from "./FabricContractSequence";
import { Sequence, SequenceOptions } from "@decaf-ts/core";
import { FabricContractContext } from "./ContractContext";
import { CouchDBKeys } from "@decaf-ts/for-couchdb";

export class FabricContractPrivateDataAdapter extends FabricContractAdapter {
  /**
   * @description Creates a new FabricContractAdapter instance
   * @summary Initializes an adapter for interacting with the Fabric state database
   * @param {void} scope - Not used in this adapter
   * @param {string} [alias] - Optional alias for the adapter instance
   */
  constructor(
    scope: void,
    alias?: string,
    private readonly collections?: string[]
  ) {
    super(scope, alias);
    this.collections = collections || [];
  }

  override async Sequence(options: SequenceOptions): Promise<Sequence> {
    return new FabricContractSequence(options, this, this.collections);
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
    instance: any,
    ...args: any[]
  ): Promise<Record<string, any>> {
    const { stub, logger } = args.pop();
    const log = logger.for(this.read);

    let model: Record<string, any>;
    try {
      const results = await this.readState(
        stub,
        tableName,
        id.toString(),
        instance
      );

      if (results.length < 1) {
        log.debug(`No record found for id ${id} in ${tableName} table`);
        throw new NotFoundError(
          `No record found for id ${id} in ${tableName} table`
        );
      } else if (results.length < 2) {
        log.debug(`No record found for id ${id} in ${tableName} table`);
        model = results.pop() as Record<string, any>;
      } else {
        model = this.mergeModels(results);
      }
    } catch (e: unknown) {
      throw this.parseError(e as Error);
    }

    return model;
  }

  /**
   * @description Deletes a record from the state database
   * @summary Retrieves a record and then removes it from the Fabric state database
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The record identifier to delete
   * @param {...any[]} args - Additional arguments, including the chaincode stub and logger
   * @return {Promise<Record<string, any>>} Promise resolving to the deleted record
   */
  override async delete(
    tableName: string,
    id: string | number,
    instance: any,
    ...args: any[]
  ): Promise<Record<string, any>> {
    const ctx = args.pop();
    const { stub, logger } = ctx;
    const log = logger.for(this.delete);

    args.push(ctx);

    let model: Record<string, any>;
    try {
      model = this.read(tableName, id, instance, ...args);
      log.verbose(`deleting entry with pk ${id} from ${tableName} table`);
      this.deleteState(stub, tableName, id.toString(), instance);
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

    const split = processModel(this, model);
    // if ((model as any)[PersistenceKeys.METADATA]) {
    //   log.silly(
    //     `Passing along persistence metadata for ${(model as any)[PersistenceKeys.METADATA]}`
    //   );
    //   Object.defineProperty(split.result, PersistenceKeys.METADATA, {
    //     enumerable: false,
    //     writable: false,
    //     configurable: true,
    //     value: (model as any)[PersistenceKeys.METADATA],
    //   });
    // }

    log.info(`Preparing record for ${tableName} table with pk ${model[pk]}`);

    return {
      record: split.privateData as Record<string, any>,
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
    const collections = Object.keys(model);

    for (const collection of collections) {
      model[collection][CouchDBKeys.TABLE] = tableName;
    }

    const record: Record<string, any> = model;

    return [tableName, id, record, ctx];
  }
  override async putState(
    stub: ChaincodeStub,
    id: string,
    model: Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ) {
    const collections = Object.keys(model);
    let res: Record<string, any> = {};
    let data: Buffer;

    for (const collection of collections) {
      res = model![collection];
      try {
        data = Buffer.from(
          FabricContractAdapter.serializer.serialize(
            model![collection] as Model
          )
        );
      } catch (e: unknown) {
        throw new SerializationError(
          `Failed to serialize record with id ${id}: ${e}`
        );
      }
      await stub.putPrivateData(collection, id.toString(), data);
    }

    return res;
  }

  override async readState(
    stub: ChaincodeStub,
    tableName: string,
    id: string,
    instance: any,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ) {
    const composedKey = stub.createCompositeKey(tableName, [String(id)]);
    const model = modelToPrivate(instance);
    const collections = Object.keys(model.private!);
    const results: any[] = [];

    for (const collection of collections) {
      try {
        let res: Buffer | Record<string, any> = await stub.getPrivateData(
          collection,
          composedKey
        );
        if (res.toString() === "") {
          throw new NotFoundError(`Entry with id ${id} doesn't exist...`);
        }
        try {
          res = FabricContractAdapter.serializer.deserialize(
            res.toString()
            // model.constructor.name
          );
        } catch (e: unknown) {
          throw new SerializationError(`Failed to parse private data: ${e}`);
        }
        results.push(res);
      } catch (e: unknown) {
        if (MISSING_PRIVATE_DATA_REGEX.test((e as BaseError).message))
          throw new UnauthorizedPrivateDataAccess(e as BaseError);
        throw e;
      }
    }

    return results;
  }

  override async deleteState(
    stub: ChaincodeStub,
    tableName: string,
    id: string,
    instance: any,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ) {
    const composedKey = stub.createCompositeKey(tableName, [String(id)]);
    const model = modelToPrivate(instance);
    const collections = Object.keys(model.private!);

    for (const collection of collections) {
      await stub.deletePrivateData(collection, composedKey);
    }
  }
}
