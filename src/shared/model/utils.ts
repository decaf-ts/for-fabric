import { Model } from "@decaf-ts/decorator-validation";
import { getFabricModelKey } from "../decorators";
import { FabricModelKeys } from "../constants";
import {
  getAllPropertyDecoratorsRecursive,
  SerializationError,
} from "@decaf-ts/db-decorators";

export function isPrivateData<M extends Model>(model: M) {
  const metadata = getPrivateDataMetadata(model);
  if (!metadata) return false;
  return true;
}

export function getPrivateDataMetadata<M extends Model>(
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
  const metadata = getPrivateDataMetadata(model);
  return metadata.isPrivate;
}

export function modelToPrivate<M extends Model>(
  model: M
): { model: M; private?: Record<string, any> } {
  if (!isPrivateData(model)) return { model: model };
  const decs: Record<string, any[]> = getAllPropertyDecoratorsRecursive(
    model,
    undefined,
    getFabricModelKey(FabricModelKeys.PRIVATE)
  ) as Record<string, any[]>;

  const result = Object.entries(decs).reduce(
    (
      accum: { model: Record<string, any>; private?: Record<string, any> },
      [k, val]
    ) => {
      const privateData = val.find((el) => el.key === "");
      if (privateData) {
        accum.private = accum.private || {};
        try {
          accum.private[k] = model[k as keyof M];
        } catch (e: unknown) {
          throw new SerializationError(
            `Failed to serialize private property ${k}: ${e}`
          );
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
  return result as { model: M; private?: Record<string, any> };
}
