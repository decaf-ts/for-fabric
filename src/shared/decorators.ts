import {
  AuthorizationError,
  Repo,
  Context,
  UnsupportedError,
  Repository,
  ContextOf,
} from "@decaf-ts/core";
import {
  afterCreate,
  afterDelete,
  afterUpdate,
  generated,
  InternalError,
  NotFoundError,
  onCreate,
  onDelete,
  onRead,
  onUpdate,
  readonly,
  transient,
  ValidationError,
  DBKeys,
} from "@decaf-ts/db-decorators";
import { Model, required } from "@decaf-ts/decorator-validation";
import { FabricModelKeys } from "./constants";
import type { Context as HLContext } from "fabric-contract-api";
import { ClientIdentity } from "fabric-shim-api";
import { FabricERC20Contract } from "../contracts/erc20/erc20contract";
import {
  apply,
  Constructor,
  Decoration,
  metadata,
  Metadata,
  prop,
  propMetadata,
} from "@decaf-ts/decoration";
import { FabricFlags } from "./types";
import { toPascalCase } from "@decaf-ts/logging";
import { FabricContractFlags } from "../contracts/types";
import "../shared/overrides";

/**
 * @description Extracts the MSP ID from either a string or ClientIdentity object
 * @param identity - The identity value which can be a string MSP ID or ClientIdentity object
 * @returns The MSP ID as a string, or undefined if not available
 */
function extractMspId(identity: string | ClientIdentity | undefined): string | undefined {
  if (!identity) return undefined;
  if (typeof identity === "string") return identity;
  return identity.getMSPID();
}

/**
 * Decorator for marking methods that require ownership authorization.
 * Checks the owner of the token before allowing the method to be executed.
 *
 * @example
 * ```typescript
 * class TokenContract extends Contract {
 *   @Owner()
 *   async Mint(ctx: Context, amount: number) {
 *     // Mint token logic
 *   }
 * }
 * ```
 *
 * @returns {MethodDecorator} A method decorator that checks ownership authorization.
 */
export function Owner() {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: FabricERC20Contract,
      ...args: any[]
    ) {
      const ctx: HLContext = args[0];
      const acountId = ctx.clientIdentity.getID();

      const select = await (this as FabricERC20Contract)[
        "tokenRepository"
      ].select();

      const tokens = await select.execute(ctx);

      if (tokens.length == 0) {
        throw new NotFoundError("No tokens avaialble");
      }

      if (tokens.length > 1) {
        throw new NotFoundError(`To many token available : ${tokens.length}`);
      }

      if (tokens[0].owner != acountId) {
        throw new AuthorizationError(
          `User not authorized to run ${propertyKey} on the token`
        );
      }

      return await originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

export async function ownedByOnCreate<
  M extends Model<boolean>,
  R extends Repo<M>,
  V,
>(
  this: R,
  context: ContextOf<R>,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  const { stub } = context as any;

  const creator = await stub.getCreator();
  const owner = creator.mspid;

  const setOwnedByKeyValue = function <M extends Model>(
    target: M,
    propertyKey: string,
    value: string | number | bigint
  ) {
    Object.defineProperty(target, propertyKey, {
      enumerable: true,
      writable: false,
      configurable: true,
      value: value,
    });
  };

  setOwnedByKeyValue(model, key as string, owner);
}

export function ownedBy() {
  function ownedBy() {
    return function (obj: any, attribute?: any) {
      return apply(
        required(),
        generated(),
        readonly(),
        onCreate(ownedByOnCreate),
        propMetadata(
          Metadata.key(FabricModelKeys.FABRIC, FabricModelKeys.OWNED_BY),
          attribute
        )
      )(obj, attribute);
    };
  }

  return Decoration.for(FabricModelKeys.OWNED_BY)
    .define({
      decorator: ownedBy,
      args: [],
    })
    .apply();
}

export async function transactionIdOnCreate<
  M extends Model<boolean>,
  R extends Repo<M>,
  V,
>(
  this: R,
  context: ContextOf<R>,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  const { stub } = context as any;
  model[key] = stub.getTxID();
}

export function transactionId() {
  function transactionId() {
    return function (obj: any, attribute?: any) {
      return apply(
        required(),
        readonly(),
        onCreate(transactionIdOnCreate),
        onUpdate(transactionIdOnCreate),
        propMetadata(
          Metadata.key(
            FabricModelKeys.FABRIC,
            attribute,
            FabricModelKeys.TRANSACTION_ID
          ),
          attribute
        )
      )(obj, attribute);
    };
  }

  return Decoration.for(FabricModelKeys.TRANSACTION_ID)
    .define({
      decorator: transactionId,
      args: [],
    })
    .apply();
}

export type MirrorCondition = (msp: string) => boolean;

export type MirrorMetadata = {
  condition: MirrorCondition;
  resolver: CollectionResolver | string;
};

export async function evalMirrorMetadata<M extends Model>(
  model: M,
  resolver: undefined | string | CollectionResolver,
  ctx: Context<FabricContractFlags>
) {
  let collection: CollectionResolver | string | undefined = resolver;
  if (typeof collection !== "string") {
    try {
      const owner =
        Model.ownerOf(model) || ctx.get("stub").getCreator().toString();
      if (resolver && typeof resolver === "function")
        collection = await resolver(model, owner, ctx);
    } catch (e: unknown) {
      throw new InternalError(`Failed to resolve collection mirror name: ${e}`);
    }
  }

  if (!collection || typeof collection !== "string")
    throw new InternalError(
      `No collection found model ${model.constructor.name}`
    );
  return collection;
}

export async function createMirrorHandler<
  M extends Model,
  R extends Repository<M, any>,
>(
  this: R,
  context: Context<FabricContractFlags>,
  data: MirrorMetadata,
  key: keyof M,
  model: M
): Promise<void> {
  const collection = await evalMirrorMetadata(model, data.resolver, context);

  const repo = this.override(
    Object.assign({}, this._overrides, {
      segregate: collection,
      ignoreValidation: true,
      ignoreHandlers: true,
    } as any)
  );

  const mirror = await repo.create(model, context);
  context.logger.info(
    `Mirror for ${Model.tableName(this.class)} created with ${Model.pk(model) as string}: ${mirror[Model.pk(model)]}`
  );
}

export async function updateMirrorHandler<
  M extends Model,
  R extends Repository<M, any>,
>(
  this: R,
  context: Context<FabricContractFlags>,
  data: MirrorMetadata,
  key: keyof M,
  model: M
): Promise<void> {
  const collection = await evalMirrorMetadata(model, data.resolver, context);

  const repo = this.override(
    Object.assign({}, this._overrides, {
      segregate: collection,
      ignoreValidation: true,
      ignoreHandlers: true,
    } as any)
  );

  const mirror = await repo.update(model, context);
  context.logger.info(
    `Mirror for ${Model.tableName(this.class)} updated with ${Model.pk(model) as string}: ${mirror[Model.pk(model)]}`
  );
}

export async function deleteMirrorHandler<
  M extends Model,
  R extends Repository<M, any>,
>(
  this: R,
  context: Context<FabricContractFlags>,
  data: MirrorMetadata,
  key: keyof M,
  model: M
): Promise<void> {
  const collection = await evalMirrorMetadata(model, data.resolver, context);

  const repo = this.override(
    Object.assign({}, this._overrides, {
      segregate: collection,
      ignoreValidation: true,
      ignoreHandlers: true,
    } as any)
  );

  const mirror = await repo.delete(Model.pk(model) as string, context);
  context.logger.info(
    `Mirror for ${Model.tableName(this.class)} deleted with ${Model.pk(model) as string}: ${mirror[Model.pk(model)]}`
  );
}

export function mirror(
  collection: CollectionResolver | string,
  condition?: MirrorCondition
) {
  function mirror(
    resolver: CollectionResolver | string,
    condition: MirrorCondition
  ) {
    const meta: MirrorMetadata = {
      condition: condition,
      resolver: resolver,
    };
    return apply(
      metadata(
        Metadata.key(FabricModelKeys.FABRIC, FabricModelKeys.MIRROR),
        meta
      ),
      privateData(collection),
      afterCreate(createMirrorHandler as any, meta, { priority: 95 }),
      afterUpdate(updateMirrorHandler as any, meta, { priority: 95 }),
      afterDelete(deleteMirrorHandler as any, meta, { priority: 95 })
    );
  }

  return Decoration.for(FabricModelKeys.MIRROR)
    .define({
      decorator: mirror,
      args: [collection, condition],
    })
    .apply();
}

export type CollectionResolver = <M extends Model>(
  model: M | Constructor<M>,
  msp?: string,
  ...args: any[]
) => string;

export const ModelCollection: CollectionResolver = <M extends Model>(
  model: M | Constructor<M>,
  mspId?: string
) => {
  const orgName =
    mspId || (typeof model !== "function" ? Model.ownerOf(model) : undefined);
  const constr = typeof model === "function" ? model : model.constructor;
  if (!orgName)
    throw new InternalError(
      `Model ${constr.name} is not owned by any organization. did you use @ownedBy() (or provide the name)?`
    );
  return `${toPascalCase(constr.name)}${orgName ? toPascalCase(orgName) : ""}`;
};

export function NamespaceCollection(namespace: string): CollectionResolver {
  return <M extends Model>(model: M | Constructor<M>, mspId?: string) => {
    const orgName =
      mspId || (typeof model !== "function" ? Model.ownerOf(model) : undefined);
    const constr = typeof model === "function" ? model : model.constructor;
    if (!orgName)
      throw new InternalError(
        `Model ${constr.name} is not owned by any organization. did you use @ownedBy() (or provide the name)?`
      );
    return `${namespace}${orgName ? toPascalCase(orgName) : ""}`;
  };
}

export const ImplicitPrivateCollection: CollectionResolver = <M extends Model>(
  model: M | Constructor<M>,
  mspId?: string
) => {
  const orgName =
    mspId || (typeof model !== "function" ? Model.ownerOf(model) : undefined);
  if (!orgName)
    throw new InternalError(
      `Model ${model.constructor.name} is not owned by any organization. did you use @ownedBy() (or provide the name)?`
    );
  return `__${toPascalCase(orgName)}PrivateCollection`;
};

export type SegregatedDataMetadata = {
  collections: string | CollectionResolver;
};

export async function segregatedDataOnCreate<M extends Model>(
  this: Repository<M, any>,
  context: ContextOf<typeof this>,
  data: SegregatedDataMetadata[],
  keys: (keyof M)[],
  model: M
): Promise<void> {
  if (keys.length !== data.length)
    throw new InternalError(
      `Segregated data keys and metadata length mismatch`
    );

  const msp = Model.ownerOf(model) || extractMspId(context.get("identity") as string | ClientIdentity | undefined);
  if (!msp)
    throw new ValidationError(
      `There's no assigned organization for model ${model.constructor.name}`
    );

  const collectionResolver = data[0].collections;
  const collection =
    typeof collectionResolver === "string"
      ? collectionResolver
      : collectionResolver(model, msp, context);

  const rebuilt = keys.reduce(
    (acc: Record<keyof M, any>, k, i) => {
      const c =
        typeof data[i].collections === "string"
          ? data[i].collections
          : data[i].collections(model, msp, context);
      if (c !== collection)
        throw new UnsupportedError(
          `Segregated data collection mismatch: ${c} vs ${collection}`
        );
      acc[k] = model[k];
      return acc;
    },
    {} as Record<keyof M, any>
  );

  const toCreate = new this.class(rebuilt);

  // const segregated = Model.segregate(model);

  const created = await this.override({
    segregated: collection,
    mergeModel: false,
    ignoreHandlers: true,
    ignoreValidation: true,
  } as any).create(toCreate, context);
  Object.assign(model, created);
}

export async function segregatedDataOnRead<M extends Model>(
  this: Repository<M, any>,
  context: Context<FabricFlags>,
  data: SegregatedDataMetadata[],
  keys: (keyof M)[],
  model: M
): Promise<void> {
  if (keys.length !== data.length)
    throw new InternalError(
      `Segregated data keys and metadata length mismatch`
    );

  const msp = Model.ownerOf(model) || extractMspId(context.get("identity"));
  if (!msp)
    throw new ValidationError(
      `There's no assigned organization for model ${model.constructor.name}`
    );

  const collectionResolver = data[0].collections;
  const collection =
    typeof collectionResolver === "string"
      ? collectionResolver
      : await collectionResolver(model, msp, context);

  const rebuilt = keys.reduce(
    (acc: Record<keyof M, any>, k, i) => {
      const c =
        typeof data[i].collections === "string"
          ? data[i].collections
          : data[i].collections(model, msp, context);
      if (c !== collection) return acc;
      acc[k] = model[k];
      return acc;
    },
    {} as Record<keyof M, any>
  );

  // const segregated = Model.segregate(model);
  //
  // const created = await this.override({ segregated: collection } as any).readAll(
  //   toCreate,
  //   context
  // );
  // Object.assign(model, created);
}

export async function segregatedDataOnUpdate<M extends Model>(
  this: Repository<M, any>,
  context: ContextOf<typeof this>,
  data: SegregatedDataMetadata[],
  key: keyof M[],
  model: M,
  oldModel: M
): Promise<void> {}

export async function segregatedDataOnDelete<
  M extends Model,
  R extends Repository<M, any>,
  V extends SegregatedDataMetadata,
>(
  this: R,
  context: ContextOf<R>,
  data: V[],
  key: keyof M[],
  model: M
): Promise<void> {}

function segregated(
  collection: string | CollectionResolver,
  type: FabricModelKeys.PRIVATE | FabricModelKeys.SHARED,
  filter?: (propName: string) => boolean
) {
  return function innerSegregated(target: object, propertyKey?: any) {
    function segregatedDec(target: object, propertyKey?: any) {
      const key = Metadata.key(type, propertyKey);
      const constr: Constructor = target.constructor as Constructor;

      const meta = Metadata.get(constr as Constructor, key) || {};
      const collections = new Set(meta.collections || []);
      collections.add(collection);
      meta.collections = [...collections];
      Metadata.set(constr as Constructor, key, meta);

      const constrMeta = Metadata.get(constr as Constructor, type) || {};
      const constrCollections = new Set(constrMeta.collections || []);
      constrCollections.add(collection);
      constrMeta.collections = [...constrCollections];
      Metadata.set(constr as Constructor, type, constrMeta);

      const transientMeta =
        Metadata.get(constr as Constructor, DBKeys.TRANSIENT) || {};
      const updatedTransientMeta = {
        ...transientMeta,
        [propertyKey as any]: {},
      };
      Metadata.set(
        constr as Constructor,
        DBKeys.TRANSIENT,
        updatedTransientMeta
      );
    }

    const decs: any[] = [];
    if (!propertyKey) {
      // decorated at the class level
      const properties = Metadata.validatableProperties(target as Constructor);
      properties?.forEach((p) => {
        if (!filter || filter(p)) {
          segregated(collection, type)((target as any).prototype, p);
        }
      });
    } else {
      decs.push(
        prop(),
        transient(),
        segregatedDec,
        onCreate(
          segregatedDataOnCreate,
          { collections: collection },
          {
            priority: 95,
            group:
              typeof collection === "string"
                ? collection
                : collection.toString(),
          }
        ),
        onRead(
          segregatedDataOnRead as any,
          { collections: collection },
          {
            priority: 95,
            group:
              typeof collection === "string"
                ? collection
                : collection.toString(),
          }
        ),
        onUpdate(
          segregatedDataOnUpdate as any,
          { collections: collection },
          {
            priority: 95,
            group:
              typeof collection === "string"
                ? collection
                : collection.toString(),
          }
        ),
        onDelete(
          segregatedDataOnDelete as any,
          { collections: collection },
          {
            priority: 95,
            group:
              typeof collection === "string"
                ? collection
                : collection.toString(),
          }
        )
      );
    }
    return apply(...decs)(target, propertyKey);
  };
}

export function privateData(
  collection: string | CollectionResolver = ImplicitPrivateCollection
) {
  function privateData(collection: string | CollectionResolver) {
    return segregated(collection, FabricModelKeys.PRIVATE);
  }

  return Decoration.for(FabricModelKeys.PRIVATE)
    .define({
      decorator: privateData,
      args: [collection],
    })
    .apply();
}

export function sharedData(collection: string | CollectionResolver) {
  function sharedData(collection: string | CollectionResolver) {
    return segregated(collection, FabricModelKeys.SHARED);
  }

  return Decoration.for(FabricModelKeys.SHARED)
    .define({
      decorator: sharedData,
      args: [collection],
    })
    .apply();
}
