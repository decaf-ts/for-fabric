import { AuthorizationError, Repo } from "@decaf-ts/core";
import {
  Context,
  InternalError,
  NotFoundError,
  onCreate,
  onDelete,
  onRead,
  onUpdate,
  readonly,
  transient,
} from "@decaf-ts/db-decorators";
import { Model, required } from "@decaf-ts/decorator-validation";
import { FabricModelKeys } from "./constants";
import { Context as HLContext } from "fabric-contract-api";
import { FabricERC20Contract } from "../contracts/erc20/erc20contract";
import {
  apply,
  Constructor,
  Decoration,
  Metadata,
  propMetadata,
} from "@decaf-ts/decoration";
import {
  FabricContractContext,
  FabricContractRepository,
} from "../contracts/index";

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
  context: Context<any>,
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

export function OwnedBy() {
  const key = getFabricModelKey(FabricModelKeys.OWNEDBY);

  function ownedBy() {
    return function (obj: any, attribute?: any) {
      return apply(
        required(),
        readonly(),
        onCreate(ownedByOnCreate),
        propMetadata(getFabricModelKey(FabricModelKeys.OWNEDBY), attribute)
      )(obj, attribute);
    };
  }

  return Decoration.for(key)
    .define({
      decorator: ownedBy,
      args: [],
    })
    .apply();
}

export function getFabricModelKey(key: string) {
  return Metadata.key(FabricModelKeys.FABRIC + key);
}

export type CollectionResolver = <M extends Model>(model: M) => string;

export const ImplicitPrivateCollection: CollectionResolver = <M extends Model>(
  model: M
) => {
  return `__${model.constructor.name}PrivateCollection`;
};

export type SegregatedDataMetadata = {
  collections: string | CollectionResolver;
};

export async function segregatedDataOnCreate<M extends Model>(
  this: FabricContractRepository<M>,
  context: FabricContractContext,
  data: SegregatedDataMetadata[],
  keys: (keyof M)[],
  model: M
): Promise<void> {
  if (keys.length !== data.length)
    throw new InternalError(
      `Segregated data keys and metadata length mismatch`
    );

  let key: string, d: SegregatedDataMetadata;
  for (let i = 0; i < keys.length; i++) {
    key = keys[i] as string;
    d = data[i];
    const collection =
      typeof d.collections === "function"
        ? d.collections(model)
        : d.collections;
    // await this.saveToCollection(context, collection, key, model[key]);
  }

  Model.segregate(model);
}

export async function segregatedDataOnRead<M extends Model>(
  this: FabricContractRepository<M>,
  context: FabricContractContext,
  data: SegregatedDataMetadata[],
  key: (keyof M)[],
  model: M
): Promise<void> {}

export async function segregatedDataOnUpdate<M extends Model>(
  this: FabricContractRepository<M>,
  context: FabricContractContext,
  data: SegregatedDataMetadata[],
  key: keyof M[],
  model: M,
  oldModel: M
): Promise<void> {}

export async function segregatedDataOnDelete<
  M extends Model,
  R extends FabricContractRepository<M>,
  V extends SegregatedDataMetadata,
>(
  this: R,
  context: FabricContractContext,
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
      if (!propertyKey) {
        const props = Metadata.properties(target as Constructor) || [];
        for (const prop of props) segregated(collection, type)(target, prop);
        return target;
      }

      const key = Metadata.key(type, propertyKey);
      const constr: Constructor = target.constructor as Constructor;

      const meta = Metadata.get(constr as Constructor, key) || {};
      const collections = new Set(meta.collections || []);
      collections.add(collection);
      meta.collections = [...collections];
      Metadata.set(constr as Constructor, key, meta);
    }
    //
    // const decs = [
    //   segregatedDec,
    //   transient(),
    //   onCreate(
    //     segregatedDataOnCreate,
    //     { collections: collection },
    //     {
    //       priority: 95,
    //       group:
    //         typeof collection === "string" ? collection : collection.toString(),
    //     }
    //   ),
    //   onRead(
    //     segregatedDataOnRead,
    //     { collections: collection },
    //     {
    //       priority: 95,
    //       group:
    //         typeof collection === "string" ? collection : collection.toString(),
    //     }
    //   ),
    //   onUpdate(
    //     segregatedDataOnUpdate,
    //     { collections: collection },
    //     {
    //       priority: 95,
    //       group:
    //         typeof collection === "string" ? collection : collection.toString(),
    //     }
    //   ),
    //   onDelete(
    //     segregatedDataOnDelete,
    //     { collections: collection },
    //     {
    //       priority: 95,
    //       group:
    //         typeof collection === "string" ? collection : collection.toString(),
    //     }
    //   ),
    // ];
    // return apply(...decs)(target, propertyKey);
    return apply()(target, propertyKey);
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
//
// export function privateData(collection?: string) {
//   if (!collection) {
//     throw new Error("Collection name is required");
//   }
//
//   const key: string = FabricModelKeys.PRIVATE;
//
//   return function privateData<M extends Model>(
//     model: M | Constructor<M>,
//     attribute?: any
//   ) {
//     const constr =
//       model instanceof Model ? (model.constructor as Constructor) : model;
//
//     const metaData: any = Metadata.get(constr);
//     const modeldata = metaData?.private?.collections || [];
//
//     propMetadata(key, {
//       ...(!attribute && {
//         collections: modeldata
//           ? [...new Set([...modeldata, collection])]
//           : [collection],
//       }),
//       isPrivate: !attribute,
//     })(attribute ? constr : model);
//
//     if (attribute) {
//       const attributeData =
//         (metaData?.private?.[attribute] as any)?.collections || [];
//       propMetadata(Metadata.key(key, attribute), {
//         collections: attributeData
//           ? [...new Set([...attributeData, collection])]
//           : [collection],
//       })(model, attribute);
//       transient()(model, attribute);
//     }
//   };
// }
