import { Model } from "@decaf-ts/decorator-validation";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import { FabricModelKeys } from "../constants";
import { SegregatedModel } from "../types";
import { DBKeys } from "@decaf-ts/db-decorators";
import { CollectionResolver, MirrorMetadata } from "../decorators";

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
    FabricModelKeys.SHARED
  );

  const result: SegregatedModel<M> = {
    model: {} as Record<keyof M, any>,
    transient: {} as Record<keyof M, any>,
    privates: {} as Record<keyof M, any>,
    shared: {} as Record<keyof M, any>,
  };

  const transientKeys = Object.keys(transientProps || {});
  const privateKeys = Object.keys(privateProperties || {});
  const sharedKeys = Object.keys(sharedProperties || {});

  const pkKey = Model.pk(model.constructor as any);
  for (const key of decoratedProperties) {
    const value = model[key as keyof M];
    const isTransient = transientKeys.includes(key);
    const isPrivate = privateKeys.includes(key);
    const isShared = sharedKeys.includes(key);
    const isPrimaryKey = key === pkKey;
    const decoratedValue =
      isPrimaryKey && typeof value === "string" && !value.endsWith(",")
        ? `${value},`
        : value;
    if (isTransient || isPrivate || isShared) {
      result.transient = result.transient || ({} as any);
      (result.transient as any)[key] = decoratedValue;
    }
    if (isPrivate) {
      result.privates = result.privates || ({} as any);
      (result.privates as any)[key] = decoratedValue;
    }
    if (isShared) {
      result.shared = result.shared || ({} as any);
      (result.shared as any)[key] = decoratedValue;
    }
    const shouldIncludeInModel = !isTransient && !isPrivate && !isShared;
    if (shouldIncludeInModel) {
      result.model = result.model || {};
      (result.model as any)[key] = value;
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

(Model as any).isShared = function isShared<M extends Model>(
  model: M | Constructor<M>
): boolean {
  return !!Metadata.get(
    typeof model !== "function" ? (model.constructor as any) : model,
    FabricModelKeys.SHARED
  );
}.bind(Model);

(Model as any).mirrored = function mirrored<M extends Model>(
  model: M | Constructor<M>
): boolean {
  return Metadata.get(
    typeof model !== "function" ? (model.constructor as any) : model,
    Metadata.key(FabricModelKeys.FABRIC, FabricModelKeys.MIRROR)
  );
}.bind(Model);

(Model as any).ownerOf = function ownerOf<M extends Model>(
  model: M
): string | undefined {
  const meta = Metadata.get(
    model.constructor as any,
    Metadata.key(FabricModelKeys.FABRIC, FabricModelKeys.OWNED_BY)
  );
  if (!meta) return undefined;
  return model[meta as keyof M] as string;
}.bind(Model);

(Model as any).mirroredAt = function mirroredAt<M extends Model>(
  model: M | Constructor<M>
): MirrorMetadata | undefined {
  model = typeof model !== "function" ? (model.constructor as any) : model;
  return Metadata.get(
    model as any,
    Metadata.key(FabricModelKeys.FABRIC, FabricModelKeys.MIRROR)
  );
}.bind(Model);

(Model as any).collectionsFor = function collectionsFor<M extends Model>(
  model: M | Constructor<M>
): {
  privateCols: (string | CollectionResolver)[];
  sharedCols: (string | CollectionResolver)[];
} {
  const privateKeys: string[] = [FabricModelKeys.PRIVATE] as string[];
  const sharedKeys: string[] = [FabricModelKeys.SHARED] as string[];

  const privateKey = Metadata.key(...privateKeys);
  const sharedKey = Metadata.key(...sharedKeys);

  const constr = typeof model === "function" ? model : model.constructor;

  const privateMeta: { collections: string[] } = Metadata.get(
    constr as any,
    privateKey
  );
  const sharedMeta: { collections: string[] } = Metadata.get(
    constr as any,
    sharedKey
  );

  return {
    privateCols: privateMeta?.collections || [],
    sharedCols: sharedMeta?.collections || [],
  };
}.bind(Model);
