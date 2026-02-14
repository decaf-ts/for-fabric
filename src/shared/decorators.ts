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
  DBOperations,
  on,
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
import { FabricContractContext } from "../contracts/index";

const MIRROR_SKIP_FLAG_PREFIX = "mirror:skip:";

/**
 * @description Extracts the MSP ID from either a string or ClientIdentity object
 * @param identity - The identity value which can be a string MSP ID or ClientIdentity object
 * @returns The MSP ID as a string, or undefined if not available
 */
function extractMspId(
  identity: string | ClientIdentity | undefined
): string | undefined {
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
  condition?: MirrorCondition;
  resolver: CollectionResolver | string;
  mspId: string;
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
    Object.assign({}, (this as any)._overrides, {
      segregated: collection,
      mirror: true,
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
    Object.assign({}, (this as any)._overrides, {
      segregated: collection,
      mirror: true,
      ignoreValidation: true,
      ignoreHandlers: true,
      applyUpdateValidation: false,
      mergeForUpdate: false,
    } as any)
  );
  await repo.update(model, context);
  context.logger.info(
    `Mirror for ${Model.tableName(this.class)} updated: ${(model as any)[Model.pk(model)]}`
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
  const pkProp = Model.pk(model) as keyof M;
  const id = model[pkProp];
  const repo = this.override(
    Object.assign({}, (this as any)._overrides, {
      segregated: collection,
      mirror: true,
      ignoreValidation: true,
      ignoreHandlers: true,
    } as any)
  );
  try {
    await repo.delete(id as any, context);
  } catch {
    // May already be deleted by adapter.deleteSegregatedCollections
  }
  context.logger.info(
    `Mirror for ${Model.tableName(this.class)} deleted: ${String(id)}`
  );
}

export async function mirrorWriteGuard<
  M extends Model,
  R extends Repository<M, any>,
>(
  this: R,
  context: Context<FabricContractFlags>,
  data: MirrorMetadata,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  key: keyof M,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  model: M
): Promise<void> {
  const msp = extractMspId(
    context.get("identity") as string | ClientIdentity | undefined
  );
  if (!msp) return;
  if (msp === data.mspId || (data.condition && data.condition(msp))) {
    throw new AuthorizationError(
      `Organization ${msp} is not authorized to modify mirrored data`
    );
  }
}

export async function readMirrorHandler<
  M extends Model,
  R extends Repository<M, any>,
>(
  this: R,
  context: Context<FabricContractFlags>,
  data: MirrorMetadata,
  key: keyof M,
  model: M
): Promise<void> {
  // Get the current MSP ID from the context
  const msp = extractMspId(
    context.get("identity") as string | ClientIdentity | undefined
  );

  if (!msp) {
    context.logger.debug(
      `Mirror read: No MSP ID available, using default read behavior`
    );
    return;
  }

  // Evaluate the mirror condition
  const collection = await evalMirrorMetadata(model, data.resolver, context);
  const skipFlagKey = `${MIRROR_SKIP_FLAG_PREFIX}${collection}`;
  const fabricCtx = context as FabricContractContext;
  const matches = msp === data.mspId || (data.condition && data.condition(msp));

  if (matches) {
    context.logger.info(
      `Mirror read: MSP ${msp} matches condition, routing ALL reads exclusively to collection ${collection}`
    );

    // Set the segregated flag in context to route ALL reads to the mirror collection
    // This ensures no reads go to world state or other collections
    fabricCtx.put("segregated", collection);
    fabricCtx.readFrom(collection);
    fabricCtx.put(skipFlagKey, false);
  } else {
    fabricCtx.put(skipFlagKey, true);
  }
}

export function mirror(
  collection: CollectionResolver | string,
  mspIdOrCondition?: string | MirrorCondition,
  condition?: MirrorCondition
) {
  const isConditionOnly =
    typeof mspIdOrCondition !== "string" && Boolean(mspIdOrCondition);
  const mspId = isConditionOnly
    ? undefined
    : (mspIdOrCondition as string | undefined);
  const cond = isConditionOnly
    ? (mspIdOrCondition as MirrorCondition)
    : condition;

  function mirror(
    resolver: CollectionResolver | string,
    mspId: string,
    condition?: MirrorCondition
  ) {
    const meta: MirrorMetadata = {
      condition: condition,
      mspId: mspId,
      resolver: resolver,
    };
    return apply(
      metadata(
        Metadata.key(FabricModelKeys.FABRIC, FabricModelKeys.MIRROR),
        meta
      ),
      privateData(collection),
      // Read handler runs early (priority 30) to set up context before any reads
      onRead(readMirrorHandler as any, meta, { priority: 30 }),
      // Write guards — reject matching MSPs before any processing
      onCreate(mirrorWriteGuard as any, meta, { priority: 20 }),
      onUpdate(mirrorWriteGuard as any, meta, { priority: 20 }),
      onDelete(mirrorWriteGuard as any, meta, { priority: 20 }),
      // Mirror sync handlers — write full model AFTER operation completes
      afterCreate(createMirrorHandler as any, meta, { priority: 95 }),
      afterUpdate(updateMirrorHandler as any, meta, { priority: 95 }),
      afterDelete(deleteMirrorHandler as any, meta, { priority: 95 })
    );
  }

  return Decoration.for(FabricModelKeys.MIRROR)
    .define({
      decorator: mirror,
      args: [collection, mspId, cond],
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

/**
 * @description Priority for early collection extraction (before pk generation at priority 60)
 * @summary This priority ensures collections are registered in context before any sequence
 * operations occur, allowing sequences to be replicated to private/shared collections.
 */
export const SEGREGATED_COLLECTION_EXTRACTION_PRIORITY = 35;

/**
 * @description Early handler to extract and register collections in context
 * @summary Runs with priority < 40 to extract collection names before pk generation (priority 60).
 * This allows FabricContractSequence to know which collections to replicate to.
 * @template M - Type that extends Model
 * @param {ContextOf<Repository<M, any>>} context - The execution context
 * @param {SegregatedDataMetadata | SegregatedDataMetadata[]} data - The segregated data metadata
 * @param {string | string[]} keys - The property key(s) being segregated
 * @param {M} model - The model instance
 * @return {Promise<void>}
 */
export async function extractSegregatedCollections<M extends Model>(
  this: Repository<M, any>,
  context: ContextOf<typeof this>,
  data: SegregatedDataMetadata | SegregatedDataMetadata[],
  keys: keyof M | (keyof M)[],
  model: M
): Promise<void> {
  const dataArray = (
    Array.isArray(data) ? data : [data]
  ) as SegregatedDataMetadata[];

  const msp =
    Model.ownerOf(model) ||
    extractMspId(
      context.get("identity") as string | ClientIdentity | undefined
    );
  if (!msp) {
    // Can't extract collections without MSP, will be caught by later handlers
    return;
  }

  const collections: string[] = [];
  for (const metadata of dataArray) {
    const collectionResolver = metadata.collections;
    const collection =
      typeof collectionResolver === "string"
        ? collectionResolver
        : collectionResolver(model, msp, context);
    if (collection && !collections.includes(collection)) {
      collections.push(collection);
    }
  }

  // Register collections early using readFrom - this allows sequence code
  // to know which collections to replicate to during pk generation
  if (collections.length > 0) {
    (context as FabricContractContext).readFrom(collections);
  }

  // Check if model is fully segregated (all non-pk properties are private/shared/transient).
  // Use Model.segregate() which is the canonical way to determine what's transient,
  // rather than reading DBKeys.TRANSIENT metadata which may not accumulate correctly
  // when class-level @privateData applies decorators iteratively.
  const fabricCtx = context as FabricContractContext;
  if (!fabricCtx.isFullySegregated) {
    const segregated = Model.segregate(model);
    const publicData = segregated.public || {};
    if (!Object.keys(publicData).length) fabricCtx.markFullySegregated();
  }

  // Store segregation metadata on the adapter (persists across context chains).
  // The Sequence creates its own context via logCtx, losing context-stored flags.
  const seqName = Model.sequenceName(model, "pk");
  fabricCtx.setSequenceSegregation(
    seqName,
    fabricCtx.isFullySegregated,
    collections
  );
}

export async function segregatedDataOnCreate<M extends Model>(
  this: Repository<M, any>,
  context: ContextOf<typeof this>,
  data: SegregatedDataMetadata | SegregatedDataMetadata[],
  keys: keyof M | (keyof M)[],
  model: M
): Promise<void> {
  const dataArray = (
    Array.isArray(data) ? data : [data]
  ) as SegregatedDataMetadata[];
  const keyArray = (Array.isArray(keys) ? keys : [keys]) as (keyof M)[];
  if (keyArray.length !== dataArray.length)
    throw new InternalError(
      `Segregated data keys and metadata length mismatch`
    );

  const msp =
    Model.ownerOf(model) ||
    extractMspId(
      context.get("identity") as string | ClientIdentity | undefined
    );
  if (!msp)
    throw new ValidationError(
      `There's no assigned organization for model ${model.constructor.name}`
    );

  const collectionResolver = dataArray[0].collections;
  const collection =
    typeof collectionResolver === "string"
      ? collectionResolver
      : collectionResolver(model, msp, context);

  // Validate all keys resolve to the same collection
  keyArray.forEach((_k, i) => {
    const c =
      typeof dataArray[i].collections === "string"
        ? dataArray[i].collections
        : dataArray[i].collections(model, msp, context);
    if (c !== collection)
      throw new UnsupportedError(
        `Segregated data collection mismatch: ${c} vs ${collection}`
      );
  });

  const keyStrings = keyArray.map((key) => String(key));
  // Store the segregated model — prepare() will filter to collection-specific fields
  (context as FabricContractContext).writeTo(collection, keyStrings);
}

export async function segregatedDataOnRead<M extends Model>(
  this: Repository<M, any>,
  context: Context<FabricFlags>,
  data: SegregatedDataMetadata | SegregatedDataMetadata[],
  keys: keyof M | (keyof M)[],
  model: M
): Promise<void> {
  const dataArray = (
    Array.isArray(data) ? data : [data]
  ) as SegregatedDataMetadata[];
  const keyArray = (Array.isArray(keys) ? keys : [keys]) as (keyof M)[];
  if (keyArray.length !== dataArray.length)
    throw new InternalError(
      `Segregated data keys and metadata length mismatch`
    );

  const msp = Model.ownerOf(model) || extractMspId(context.get("identity"));
  if (!msp)
    throw new ValidationError(
      `There's no assigned organization for model ${model.constructor.name}`
    );

  const collectionResolver = dataArray[0].collections;
  const collection =
    typeof collectionResolver === "string"
      ? collectionResolver
      : await collectionResolver(model, msp, context);

  const skipFlagKey = `${MIRROR_SKIP_FLAG_PREFIX}${collection}`;
  const fabricCtx = context as FabricContractContext;
  if (fabricCtx.getOrUndefined(skipFlagKey as any)) return;

  (context as FabricContractContext).readFrom(collection);
}

export async function segregatedDataOnUpdate<M extends Model>(
  this: Repository<M, any>,
  context: ContextOf<typeof this>,
  data: SegregatedDataMetadata | SegregatedDataMetadata[],
  key: keyof M | (keyof M)[],
  model: M,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  oldModel: M
): Promise<void> {
  const dataArray = (
    Array.isArray(data) ? data : [data]
  ) as SegregatedDataMetadata[];
  const keyArray = (Array.isArray(key) ? key : [key]) as (keyof M)[];
  if (keyArray.length !== dataArray.length)
    throw new InternalError(
      `Segregated data keys and metadata length mismatch`
    );

  const msp =
    Model.ownerOf(model) ||
    extractMspId(
      context.get("identity") as string | ClientIdentity | undefined
    );
  if (!msp)
    throw new ValidationError(
      `There's no assigned organization for model ${model.constructor.name}`
    );

  const collectionResolver = dataArray[0].collections;
  const collection =
    typeof collectionResolver === "string"
      ? collectionResolver
      : collectionResolver(model, msp, context);

  keyArray.forEach((k, i) => {
    const c =
      typeof dataArray[i].collections === "string"
        ? dataArray[i].collections
        : dataArray[i].collections(model, msp, context);
    if (c !== collection)
      throw new UnsupportedError(
        `Segregated data collection mismatch: ${c} vs ${collection}`
      );
  });

  const keyStrings = (keyArray as (keyof M)[]).map((key) => String(key));
  // Store the original model — prepare() will filter to collection-specific fields
  (context as FabricContractContext).writeTo(collection, keyStrings);
}

export async function segregatedDataOnDelete<
  M extends Model,
  R extends Repository<M, any>,
  V extends SegregatedDataMetadata,
>(
  this: R,
  context: ContextOf<R>,
  data: V | V[],
  key: (keyof M)[],
  model: M
): Promise<void> {
  const dataArray = (Array.isArray(data) ? data : [data]) as V[];
  const keyArray = (Array.isArray(key) ? key : [key]) as (keyof M)[];
  if (keyArray.length !== dataArray.length)
    throw new InternalError(
      `Segregated data keys and metadata length mismatch`
    );

  const msp =
    Model.ownerOf(model) ||
    extractMspId(
      context.get("identity") as string | ClientIdentity | undefined
    );
  if (!msp)
    throw new ValidationError(
      `There's no assigned organization for model ${model.constructor.name}`
    );

  const collectionResolver = dataArray[0].collections;
  const collection =
    typeof collectionResolver === "string"
      ? collectionResolver
      : collectionResolver(model, msp, context);

  (context as FabricContractContext).readFrom(collection);
}

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
      const properties = Metadata.getAttributes(target as Constructor);
      properties?.forEach((p) => {
        if (!filter || filter(p)) {
          segregated(collection, type)((target as any).prototype, p);
        }
      });
      return target;
    } else {
      const groupName =
        typeof collection === "string" ? collection : collection.toString();
      // Use different group names for extraction vs data handlers to prevent merging
      const extractGroupName = `${groupName}:extract`;
      const dataGroupName = `${groupName}:data`;
      const earlyExtractionMeta = { collections: collection };
      const earlyExtractionGroupSort = {
        priority: SEGREGATED_COLLECTION_EXTRACTION_PRIORITY,
        group: extractGroupName,
      };
      decs.push(
        prop(),
        transient(),
        segregatedDec,
        // Early extraction handlers - run BEFORE pk generation (priority 60)
        // This ensures collections are registered in context for sequence replication
        // We register for each operation explicitly to ensure proper handler lookup
        on(
          DBOperations.ALL,
          extractSegregatedCollections as any,
          earlyExtractionMeta,
          earlyExtractionGroupSort
        ),
        // Main handlers for segregated data operations (priority 95)
        onCreate(
          segregatedDataOnCreate,
          { collections: collection },
          {
            priority: 95,
            group: dataGroupName,
          }
        ),
        onRead(
          segregatedDataOnRead as any,
          { collections: collection },
          {
            priority: 95,
            group: dataGroupName,
          }
        ),
        onUpdate(
          segregatedDataOnUpdate as any,
          { collections: collection },
          {
            priority: 95,
            group: dataGroupName,
          }
        ),
        onDelete(
          segregatedDataOnDelete as any,
          { collections: collection },
          {
            priority: 95,
            group: dataGroupName,
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
