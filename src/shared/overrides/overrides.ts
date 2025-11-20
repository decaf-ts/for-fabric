import { Model } from "@decaf-ts/decorator-validation";
// import { validateCompare } from "../model/validation";
import { Constructor, Metadata } from "@decaf-ts/decoration";
// import { DBKeys } from "../model/constants";
// import { SerializationError } from "../repository/errors";
import { FabricModelKeys } from "../constants";
import { SegregatedModel } from "../types";

Model.prototype.isShared = function isShared<M extends Model>(
  this: M
): boolean {
  return Model.isShared(this.constructor as Constructor<M>);
};

Model.prototype.isPrivate = function isPrivate<M extends Model>(
  this: M
): boolean {
  return Model.isPrivate(this.constructor as Constructor<M>);
};

Model.prototype.segregate = function segregate<M extends Model>(
  this: M
): SegregatedModel<M> {
  throw new Error("not implemented");
};

//
// (Model as any).toTransient = function toTransient<M extends Model>(model: M) {
//   if (!Metadata.isTransient(model)) return { model: model };
//   const decoratedProperties = Metadata.validatableProperties(
//     model.constructor as any
//   );
//
//   const transientProps = Metadata.get(
//     model.constructor as any,
//     DBKeys.TRANSIENT
//   );
//
//   const result = {
//     model: {} as Record<string, any>,
//     transient: {} as Record<string, any>,
//   };
//   for (const key of decoratedProperties) {
//     const isTransient = Object.keys(transientProps).includes(key);
//     if (isTransient) {
//       result.transient = result.transient || {};
//       try {
//         result.transient[key] = model[key as keyof M];
//       } catch (e: unknown) {
//         throw new SerializationError(
//           `Failed to serialize transient property ${key}: ${e}`
//         );
//       }
//     } else {
//       result.model = result.model || {};
//       result.model[key] = (model as Record<string, any>)[key];
//     }
//   }
//
//   result.model = Model.build(result.model, model.constructor.name);
//   return result as { model: M; transient?: Record<string, any> };
// };

(Model as any).segregate = function segregate<M extends Model>(
  model: M
): SegregatedModel<M> {
  if (!Model.isTransient(model)) {
  }
  throw new Error("not implemented");
}.bind(Model);

(Model as any).isPrivate = function isPrivate<M extends Model>(
  model: M | Constructor<M>
): boolean {
  return !!Metadata.get(
    typeof model !== "function" ? (model.constructor as any) : model,
    FabricModelKeys.PRIVATE
  );
}.bind(Model);

(Metadata as any).isShared = function isShared<M extends Model>(
  model: M | Constructor<M>
): boolean {
  return !!Metadata.get(
    typeof model !== "function" ? (model.constructor as any) : model,
    FabricModelKeys.SHARED
  );
}.bind(Metadata);
