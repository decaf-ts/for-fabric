import {
  AuthorizationError,
  Repo,
  Context,
  UnsupportedError,
  Repository,
  ContextOf,
  ContextualArgs,
} from "@decaf-ts/core";
import {
  InternalError,
  NotFoundError,
  onCreate,
  onDelete,
  onRead,
  onUpdate,
  OperationKeys,
  readonly,
  transient,
  ValidationError,
} from "@decaf-ts/db-decorators";
import { Model, required } from "@decaf-ts/decorator-validation";
import { FabricModelKeys } from "./constants";
import type { Context as HLContext } from "fabric-contract-api";
import { FabricERC20Contract } from "../contracts/erc20/erc20contract";
import {
  apply,
  Constructor,
  Decoration,
  metadata,
  Metadata,
  propMetadata,
} from "@decaf-ts/decoration";
import { FabricFlags } from "./types";
import { toPascalCase } from "@decaf-ts/logging";
import { FabricContractContext } from "../contracts/index";
import { Audit } from "../contract/models/Audit";

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

export type MirrorCondition = <M extends Model>(
  m: M,
  stub: any,
  ctx: Context
) => Promise<boolean>;

export type MirrorMetadata = {
  condition: MirrorCondition;
  resolver?: CollectionResolver;
};

export async function createMirrorHandler<
  M extends Model,
  R extends Repository<M, any>,
>(
  this: R,
  context: FabricContractContext,
  data: MirrorMetadata,
  key: keyof M,
  model: M
): Promise<void> {
  let shouldExecute: boolean;
  try {
    shouldExecute = await data.condition(model, context.stub, context);
  } catch (e: unknown) {
    throw new InternalError(
      `Failed to validate Mirror condition execution: ${e}`
    );
  }

  if (!shouldExecute) return;

  let collection: string | undefined = undefined;
  try {
    if (data.resolver) collection = await data.resolver(model, "", context);
  } catch (e: unknown) {
    throw new InternalError(`Failed to resolve collection mirror name: ${e}`);
  }
  if (!collection)
    throw new InternalError(
      `No collection found model ${model.constructor.name}`
    );

  const repo = this.override(
    Object.assign({}, this._overrides, {
      segregate: collection,
      ignoreValidation: true,
      ignoreHandlers: true,
    } as any)
  );

  const mirror = await repo.create(model, context);
  context.logger.info(`Mirror for ${Model.tableName(this.class)} created`);
}

export function mirror(
  condition: MirrorCondition,
  resolver?: CollectionResolver
) {
  function mirror(condition: MirrorCondition, resolver?: CollectionResolver) {
    return apply(
      metadata(Metadata.key(FabricModelKeys.FABRIC, FabricModelKeys.MIRROR), {
        condition: condition,
        resolver: resolver,
      })
    );
  }

  return Decoration.for(FabricModelKeys.MIRROR)
    .define({
      decorator: mirror,
      args: [condition, resolver],
    })
    .apply();
}

export type CollectionResolver = <M extends Model>(
  model: M,
  msp?: string,
  ...args: ContextualArgs<any>
) => Promise<string>;

export const ModelCollection: CollectionResolver = async <M extends Model>(
  model: M,
  msp?: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ...args: ContextualArgs<any>
) => {
  return `${toPascalCase(Model.tableName(model.constructor as any))}${msp ? toPascalCase(msp) : ""}PrivateCollection`;
};

export const ImplicitPrivateCollection: CollectionResolver = async <
  M extends Model,
>(
  model: M,
  mspId?: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ...args: ContextualArgs<any>
) => {
  const orgName = Model.ownerOf(model) || mspId;
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

  const msp = Model.ownerOf(model);
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

  const created = await this.override({ segregated: collection } as any).create(
    toCreate,
    context
  );
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

  const msp = Model.ownerOf(model);
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
  type: FabricModelKeys.PRIVATE | FabricModelKeys.SHARED
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
      meta.collections = [...collections];
      Metadata.set(constr as Constructor, type, meta);
    }

    const decs: any[] = [];
    if (!propertyKey) {
      // decorated at the class level
      Metadata.properties(target as Constructor)?.forEach((p) =>
        segregated(collection, type)(target, p)
      );
    } else {
      decs.push(
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
    // return apply()(target, propertyKey);
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
