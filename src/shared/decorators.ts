import { AuthorizationError } from "@decaf-ts/core";
import { FabricContractContext, FabricERC20Contract } from "../contracts";
import { NotFoundError, transient } from "@decaf-ts/db-decorators";
import { Model, ModelKeys, propMetadata } from "@decaf-ts/decorator-validation";
import { FabricModelKeys } from "./constants";

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
      const ctx: FabricContractContext = args[0];
      const acountId = ctx.identity.getID();

      const tokens = await (this as FabricERC20Contract)["tokenRepository"]
        .select(undefined, ctx)
        .execute();

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

export function getFabricModelKey(key: string) {
  return Model.key(FabricModelKeys.FABRIC + key);
}

export function privateData(collection?: string) {
  if (!collection) {
    throw new Error("Collection name is required");
  }

  const key: string = getFabricModelKey(FabricModelKeys.PRIVATE);

  return function privateData(model: any, attribute?: string) {
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
