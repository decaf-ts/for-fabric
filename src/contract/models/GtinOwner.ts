import { column, index, OrderDirection, pk, table } from "@decaf-ts/core";
import { type ModelArg } from "@decaf-ts/decorator-validation";
import { model, required } from "@decaf-ts/decorator-validation";
import { description, uses } from "@decaf-ts/decoration";
import { BlockOperations, OperationKeys } from "@decaf-ts/db-decorators";
import { BaseIdentifiedModel } from "./BaseIdentifiedModel";
import { gtin } from "./gtin";
import { FabricFlavour, ownedBy } from "../../shared/index";

@description(
  "Model representing the owner of a GTIN (Global Trade Item Number)."
)
@BlockOperations([
  OperationKeys.CREATE,
  OperationKeys.UPDATE,
  OperationKeys.DELETE,
])
@uses(FabricFlavour)
@table("owner")
@model()
export class GtinOwner extends BaseIdentifiedModel {
  @pk()
  @gtin()
  @description("The product code associated with this GTIN owner.")
  productCode!: string;

  // @cache()
  @column()
  @ownedBy()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("The owner of this GTIN. (Fabric's MSP ID of the MAH)")
  ownedBy!: string;

  @column()
  // @url()
  @description(
    "The url matching the owner's endpoint - only exists for caching purposes, sourced from entity"
  )
  endpoint?: string;

  constructor(model?: ModelArg<GtinOwner>) {
    super(model);
  }
}
