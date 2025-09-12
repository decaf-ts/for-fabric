import {
  InternalError,
  modelToTransient,
  SerializationError,
} from "@decaf-ts/db-decorators";
import { Model } from "@decaf-ts/decorator-validation";
import {
  hasPrivateData,
  isModelPrivate,
  modelToPrivate,
} from "../shared/model/utils";
import { Repository } from "@decaf-ts/core";
import { ChaincodeStub } from "fabric-shim";

export function processModel<M extends Model>(adapter: any, model: M) {
  const transient = modelToTransient(model);
  const privateData = modelToPrivate(model);

  const transformModel = (model: any) => {
    return Object.entries(model).reduce(
      (accum: Record<string, any>, [key, val]) => {
        if (typeof val === "undefined") return accum;
        const mappedProp = Repository.column(model, key);
        if (adapter.isReserved(mappedProp))
          throw new InternalError(`Property name ${mappedProp} is reserved`);
        accum[mappedProp] = val;
        return accum;
      },
      {}
    );
  };

  if (privateData.private) {
    const collections = Object.keys(privateData.private);

    for (const collection of collections) {
      privateData.private![collection] = transformModel(
        privateData.private![collection]
      );
    }
  }

  return {
    model: transient.model,
    transient: transient.transient,
    privateData: privateData.private,
    result: transformModel(transient.model),
  };
}

export async function saveData(
  this: ChaincodeStub,
  id: string,
  model: Record<string, any>,
  privateData: Record<string, any>,
  instance: any
) {
  let data: Buffer;
  if (isModelPrivate(instance)) {
    await savePrivateData.call(this, id, privateData);
  } else {
    try {
      data = Buffer.from(JSON.stringify(model));
    } catch (e: unknown) {
      throw new SerializationError(
        `Failed to serialize record with id ${id}: ${e}`
      );
    }
    await this.putState(id.toString(), data);

    if (hasPrivateData(instance as Model))
      await savePrivateData.call(this, id.toString(), privateData || {});
  }
}

export async function savePrivateData(
  this: ChaincodeStub,
  id: string,
  privateData: Record<string, any>
) {
  const collections = Object.keys(privateData!);

  let data: Buffer;

  for (const collection of collections) {
    try {
      data = Buffer.from(JSON.stringify(privateData![collection] as Model));
    } catch (e: unknown) {
      throw new SerializationError(
        `Failed to serialize record with id ${id}: ${e}`
      );
    }
    await this.putPrivateData(collection, id.toString(), data);
  }
}
