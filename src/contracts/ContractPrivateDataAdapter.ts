import { ChaincodeStub } from "fabric-shim";
import { FabricContractAdapter } from "./ContractAdapter";
import {
  BaseError,
  InternalError,
  NotFoundError,
  Repository,
  SerializationError,
} from "@decaf-ts/db-decorators";
import { Model } from "@decaf-ts/decorator-validation";
import { PersistenceKeys } from "@decaf-ts/core";
import {
  MISSING_PRIVATE_DATA_REGEX,
  modelToPrivate,
  processModel,
} from "./private-data";
import { UnauthorizedPrivateDataAccess } from "../shared/errors";

export class FabricContractPrivateDataAdapter extends FabricContractAdapter {
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
      record: split.privateData as Record<string, any>,
      id: stub.createCompositeKey(tableName, [String(model[pk])]),
      transient: split.transient,
    };
  }
  override async putState(
    stub: ChaincodeStub,
    id: string,
    model: Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ) {
    const collections = Object.keys(model);
    let data: Buffer;

    for (const collection of collections) {
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
}
