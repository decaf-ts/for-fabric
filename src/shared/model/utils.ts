import { Model } from "@decaf-ts/decorator-validation";
import { getFabricModelKey } from "../decorators";
import { FabricModelKeys } from "../constants";
import {
  getAllPropertyDecoratorsRecursive,
  SerializationError,
} from "@decaf-ts/db-decorators";

export function isPrivateData<M extends Model>(model: M) {
  const one = Reflect.getMetadata(
    getFabricModelKey(FabricModelKeys.PRIVATE),
    model.constructor
  );

  console.log(one);

  const two = Reflect.getMetadata(
    getFabricModelKey(FabricModelKeys.PRIVATE),
    Model.get(model.constructor.name) as any
  );

  console.log(two);

  return !!(one || two);
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
