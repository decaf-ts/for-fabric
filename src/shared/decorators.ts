import { AuthorizationError, Repo } from "@decaf-ts/core";
import { FabricContractContext, FabricERC20Contract } from "../contracts";
import {
  Context,
  NotFoundError,
  onCreate,
  readonly,
  RepositoryFlags,
  transient,
} from "@decaf-ts/db-decorators";
import {
  Decoration,
  Model,
  ModelKeys,
  propMetadata,
  required,
} from "@decaf-ts/decorator-validation";
import { FabricModelKeys } from "./constants";
import { Context as HLContext } from "fabric-contract-api";
import { apply } from "@decaf-ts/reflection";

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
      ].select(undefined, ctx);

      const tokens = await select.execute();

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
  M extends Model,
  R extends Repo<M, F, C>,
  V,
  F extends RepositoryFlags,
  C extends Context<F>,
>(
  this: R,
  context: Context<F>,
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
  return Model.key(FabricModelKeys.FABRIC + key);
}

export function privateData(collection?: string) {
  if (!collection) {
    throw new Error("Collection name is required");
  }

  const key: string = getFabricModelKey(FabricModelKeys.PRIVATE);

  return function privateData(model: any, attribute?: any) {
    const propertyKey = attribute || undefined;

    const meta = Reflect.getMetadata(
      key,
      model[ModelKeys.ANCHOR] || model,
      propertyKey as string
    );
    const data = meta?.collections || [];

    propMetadata(getFabricModelKey(FabricModelKeys.PRIVATE), {
      ...(!attribute && {
        collections: data ? [...new Set([...data, collection])] : [collection],
      }),
      isPrivate: !attribute,
    })(attribute ? model.constructor : model[ModelKeys.ANCHOR] || model);

    if (attribute) {
      propMetadata(getFabricModelKey(FabricModelKeys.PRIVATE), {
        collections: data ? [...new Set([...data, collection])] : [collection],
      })(model, attribute);
      transient()(model, attribute);
    }
  };
}
