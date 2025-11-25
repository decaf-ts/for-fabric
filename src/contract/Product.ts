import type { ModelArg } from "@decaf-ts/decorator-validation";
import { Model, model } from "@decaf-ts/decorator-validation";
import { column, pk, table } from "@decaf-ts/core";
import { FabricFlavour } from "../shared/constants";
import { uses } from "@decaf-ts/decoration";

@uses(FabricFlavour)
@table()
@model()
export class Product extends Model {
  @pk({ type: "String" })
  productCode!: string;

  @column()
  inventedName!: string;

  constructor(args?: ModelArg<Product>) {
    super(args);
  }
}
