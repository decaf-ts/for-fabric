import type { ModelArg } from "@decaf-ts/decorator-validation";
import { Model, model } from "@decaf-ts/decorator-validation";
import { column, pk, table, uses } from "@decaf-ts/core";
import { FabricFlavour } from "../shared/constants";

@uses(FabricFlavour)
@table()
@model()
export class User extends Model {
  @pk({ type: "Number" })
  id!: string;

  @column()
  name!: string;

  constructor(args?: ModelArg<User>) {
    super(args);
  }
}
