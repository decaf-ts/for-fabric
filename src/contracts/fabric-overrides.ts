import {
  apply,
  Decoration,
  Metadata,
  propMetadata,
} from "@decaf-ts/decoration";
import {
  PersistenceKeys,
  UnsupportedError,
} from "@decaf-ts/core";
import {
  onCreate,
  onCreateUpdate,
} from "@decaf-ts/db-decorators";
import { FabricFlavour } from "../shared/constants";
import {
  Property,
  Property as FabricProperty,
  Object as FabricObject,
} from "fabric-contract-api";
import { ValidationKeys } from "@decaf-ts/decorator-validation";

export async function createdByOnFabricCreateUpdate(
  this: any,
  context: any,
  data: any,
  key: PropertyKey,
  model: any
): Promise<void> {
  try {
    const user = context.get("identity");
    model[key] = user.getID();
  } catch {
    throw new UnsupportedError(
      "No User found in context. Please provide a user in the context"
    );
  }
}

Decoration.flavouredAs(FabricFlavour)
  .for(PersistenceKeys.CREATED_BY)
  .define({
    decorator: function createdBy() {
      return apply(
        onCreate(createdByOnFabricCreateUpdate),
        propMetadata(PersistenceKeys.CREATED_BY, {})
      );
    },
  } as any)
  .apply();

Decoration.flavouredAs(FabricFlavour)
  .for(PersistenceKeys.UPDATED_BY)
  .define({
    decorator: function updatedBy() {
      return apply(
        onCreateUpdate(createdByOnFabricCreateUpdate),
        propMetadata(PersistenceKeys.UPDATED_BY, {})
      );
    },
  } as any)
  .apply();

Decoration.flavouredAs(FabricFlavour)
  .for(PersistenceKeys.COLUMN)
  .extend(FabricProperty())
  .apply();

Decoration.flavouredAs(FabricFlavour)
  .for(ValidationKeys.DATE)
  .extend(function fabricProperty() {
    return (target: any, prop?: any) => {
      Property(prop, "string:date")(target, prop);
    };
  });

Decoration.flavouredAs(FabricFlavour)
  .for(PersistenceKeys.TABLE)
  .extend(function table(obj: any) {
    const chain: any[] = [];
    let current =
      typeof obj === "function"
        ? Metadata.constr(obj)
        : Metadata.constr(obj.constructor);

    while (current && current !== Object && current.prototype) {
      chain.push(current);
      current = Object.getPrototypeOf(current);
    }

    while (chain.length > 0) {
      const constructor = chain.pop();
      FabricObject()(constructor);
    }

    return FabricObject()(obj);
  })
  .apply();
