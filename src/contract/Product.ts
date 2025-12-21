import { type ModelArg, required } from "@decaf-ts/decorator-validation";
import { model } from "@decaf-ts/decorator-validation";
import { column, pk, table } from "@decaf-ts/core";
import { FabricFlavour } from "../shared/constants";
import { FabricIdentifiedBaseModel } from "../shared/model/FabricIdentifiedBaseModel";
import { uses } from "@decaf-ts/decoration";

@uses(FabricFlavour)
@table()
@model()
export class Product extends FabricIdentifiedBaseModel {
  @pk({ type: "Number", generated: true })
  productCode!: number;

  @column()
  @required()
  inventedName!: string;

  constructor(args?: ModelArg<Product>) {
    super(args);
  }
}
