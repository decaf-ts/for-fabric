import { Model } from "@decaf-ts/decorator-validation";
// import { validateCompare } from "../model/validation";
import { Constructor, Metadata } from "@decaf-ts/decoration";
// import { DBKeys } from "../model/constants";
// import { SerializationError } from "../repository/errors";
import { FabricModelKeys } from "../constants";
import { SegregatedModel } from "../types";
import { DBKeys, SerializationError } from "@decaf-ts/db-decorators";

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
  return Model.segregate(this);
};

(Model as any).segregate = function segregate<M extends Model>(
  model: M
): SegregatedModel<M> {
  if (!Model.isTransient(model)) return { model: model };
  const decoratedProperties = Metadata.validatableProperties(
    model.constructor as any
  );

  const transientProps = Metadata.get(
    model.constructor as any,
    DBKeys.TRANSIENT
  );
  const privateProperties = Metadata.get(
    model.constructor as any,
    FabricModelKeys.PRIVATE
  );
  const sharedProperties = Metadata.get(
    model.constructor as any,
    FabricModelKeys.PRIVATE
  );

  const result: SegregatedModel<M> = {
    model: {} as Record<keyof M, any>,
    transient: {} as Record<keyof M, any>,
    private: {} as Record<keyof M, any>,
    shared: {} as Record<keyof M, any>,
  };

  const transientKeys = Object.keys(transientProps);
  const privateKeys = Object.keys(privateProperties);
  const sharedKeys = Object.keys(sharedProperties);

  for (const key of decoratedProperties) {
    const isTransient = transientKeys.includes(key);
    const isPrivate = privateKeys.includes(key);
    const isShared = sharedKeys.includes(key);
    if (isTransient) {
      result.transient = result.transient || ({} as any);
      (result.transient as any)[key] = model[key as keyof M];
      if (isPrivate) {
        result.private = result.private || ({} as any);
        (result.private as any)[key] = model[key as keyof M];
      }
      if (isShared) {
        result.shared = result.shared || ({} as any);
        (result.shared as any)[key] = model[key as keyof M];
      }
    } else {
      result.model = result.model || {};
      (result.model as any)[key] = (model as Record<string, any>)[key];
    }
  }

  result.model = Model.build(result.model, model.constructor.name);
  return result as SegregatedModel<M>;
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
