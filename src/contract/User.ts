import type { ModelArg } from "@decaf-ts/decorator-validation";
import { Model, model } from "@decaf-ts/decorator-validation";
import { column, pk, table } from "@decaf-ts/core";
import { FabricFlavour } from "../shared/constants";
import { uses } from "@decaf-ts/decoration";

@uses(FabricFlavour)
@table()
@model()
export class User extends Model {
  @pk({ type: "Number", generated: true })
  id!: number;

  @column()
  name!: string;

  constructor(args?: ModelArg<User>) {
    super(args);
  }
}
