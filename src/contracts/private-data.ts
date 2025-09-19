import {
  InternalError,
  modelToTransient,
  getAllPropertyDecoratorsRecursive,
  SerializationError,
} from "@decaf-ts/db-decorators";
import { Model } from "@decaf-ts/decorator-validation";
import { Repository } from "@decaf-ts/core";
import { getFabricModelKey } from "../shared/decorators";
import { FabricModelKeys } from "../shared/constants";

export const MISSING_PRIVATE_DATA_REGEX =
  /private\s+data\s+matching\s+public\s+hash\s+version\s+is\s+not\s+available/i;

export const MISSING_PRIVATE_DATA_ERROR_MESSAGE =
  "private data matching public hash version is not available ...";

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

export function hasPrivateData<M extends Model>(model: M) {
  const metadata = getClassPrivateDataMetadata(model);
  if (!metadata) return false;
  return true;
}

export function getClassPrivateDataMetadata<M extends Model>(
  model: M
): Record<string, any> {
  let metadata = Reflect.getMetadata(
    getFabricModelKey(FabricModelKeys.PRIVATE),
    model
  );

  metadata =
    metadata ||
    Reflect.getMetadata(
      getFabricModelKey(FabricModelKeys.PRIVATE),
      model.constructor
    );

  return metadata;
}

export function isModelPrivate<M extends Model>(model: M): boolean {
  const metadata = getClassPrivateDataMetadata(model);
  if (!metadata || metadata.isPrivate === undefined) return false;
  return metadata.isPrivate;
}

export function modelToPrivate<M extends Model>(
  model: M
): { model: M; private?: Record<string, Record<string, any>> } {
  if (!hasPrivateData(model)) return { model: model };
  const decs: Record<string, any[]> = getAllPropertyDecoratorsRecursive(
    model,
    undefined,
    getFabricModelKey(FabricModelKeys.PRIVATE)
  ) as Record<string, any[]>;

  const isPrivate = isModelPrivate(model);
  const modelCollections: Record<string, any> =
    getClassPrivateDataMetadata(model);

  const result = Object.entries(decs).reduce(
    (
      accum: { model: Record<string, any>; private?: Record<string, any> },
      [k, val]
    ) => {
      const privateData = val.find((el) => el.key === "");

      if (privateData || isPrivate) {
        const collections = isPrivate
          ? modelCollections.collections
          : privateData.props.collections;
        accum.private = accum.private || {};

        for (const collection of collections) {
          try {
            accum.private[collection] = accum.private[collection] || {};
            accum.private[collection][k] = model[k as keyof M];
          } catch (e: unknown) {
            throw new SerializationError(
              `Failed to serialize private property ${k}: ${e}`
            );
          }
        }
      } else {
        accum.model = accum.model || {};
        accum.model[k] = (model as Record<string, any>)[k];
      }
      return accum;
    },
    {} as { model: Record<string, any>; private?: Record<string, any> }
  );
  result.model = Model.build(result.model, model.constructor.name);

  if (result.private) {
    const collections = Object.keys(result.private);

    for (const collection of collections) {
      result.private![collection] = Model.build(
        result.private![collection],
        model.constructor.name
      );
    }
  }
  return result as { model: M; private?: Record<string, Record<string, any>> };
}
