import type { ModelArg } from "@decaf-ts/decorator-validation";
import { model, required } from "@decaf-ts/decorator-validation";
import { column, index, OrderDirection, pk, table } from "@decaf-ts/core";
import { TableNames } from "./constants";
import { description, uses } from "@decaf-ts/decoration";
import { FabricFlavour } from "../../../../src/shared/constants";
import { FabricIdentifiedModel } from "./FabricIdentifiedModel";

@uses(FabricFlavour)
@table(TableNames.ProductStrength)
@model()
@description("Represents the product’s strength and composition details.")
export class ProductStrength extends FabricIdentifiedModel {
  @pk()
  @description("Unique identifier of the product strength.")
  id!: string;

  // @manyToOne(
  //   () => Product,
  //   { update: Cascade.NONE, delete: Cascade.NONE },
  //   false
  // )
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Product code associated with this strength entry.")
  productCode!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Product concentration or dosage (e.g., 500mg, 10%).")
  strength!: string;

  @column()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Active substance related to this product strength.")
  substance?: string;

  @column()
  @description("Legal entity name responsible for the product.")
  legalEntityName?: string;

  constructor(model?: ModelArg<ProductStrength>) {
    super(model);
  }
}
