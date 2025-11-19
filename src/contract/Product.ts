import type { ModelArg } from "@decaf-ts/decorator-validation";
import { Model, model } from "@decaf-ts/decorator-validation";
import { column, pk, table, uses } from "@decaf-ts/core";
import { FabricFlavour } from "../shared/constants";

@uses(FabricFlavour)
@table()
@model()
export class Product extends Model {
  @pk({ type: "Number" })
  productCode!: string;

  @column()
  inventedName!: string;

  constructor(args?: ModelArg<Product>) {
    super(args);
  }
}
