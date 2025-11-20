import { InternalError, SerializationError } from "@decaf-ts/db-decorators";
import { Model } from "@decaf-ts/decorator-validation";
import { Repository } from "@decaf-ts/core";
import { FabricModelKeys } from "../shared/constants";
import { Constructor, Metadata } from "@decaf-ts/decoration";

export const MISSING_PRIVATE_DATA_REGEX =
  /private\s+data\s+matching\s+public\s+hash\s+version\s+is\s+not\s+available/i;

export const MISSING_PRIVATE_DATA_ERROR_MESSAGE =
  "private data matching public hash version is not available ...";

export function processModel<M extends Model>(adapter: any, model: M) {
  const transient = Model.segregate(model);
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
  return Metadata.get(
    model.constructor as Constructor,
    FabricModelKeys.PRIVATE
  );
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

  const isPrivate = isModelPrivate(model);
  const modelCollections: Record<string, any> =
    getClassPrivateDataMetadata(model);

  let result: { model: Record<string, any>; private?: Record<string, any> } = {
    model: model as Record<string, any>,
    private: undefined,
  };

  // TODO: the is private is not workign correctly. If no properties it doesn't create the private part.
  if (isPrivate) {
    const privatePart = modelCollections.collections;
    result = (
      Metadata.properties(model.constructor as Constructor) || []
    ).reduce(
      (
        accum: { model: Record<string, any>; private?: Record<string, any> },
        k
      ) => {
        const collections = modelCollections.collections;
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

        return accum;
      },
      { model: {}, private: privatePart } as {
        model: Record<string, any>;
        private?: Record<string, any>;
      }
    );
  } else {
    result = Object.entries(modelCollections).reduce(
      (
        accum: { model: Record<string, any>; private?: Record<string, any> },
        [k, val]
      ) => {
        const props = Metadata.properties(model.constructor as Constructor);
        if (!props?.includes(k)) return accum;

        const collections = (val as Record<string, any>).collections;

        if (collections?.length) {
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
  }

  result.model = result.model || {};

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
