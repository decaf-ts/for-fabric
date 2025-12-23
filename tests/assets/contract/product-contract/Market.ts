import type { ModelArg } from "@decaf-ts/decorator-validation";
import {
  maxlength,
  minlength,
  model,
  pattern,
  required,
} from "@decaf-ts/decorator-validation";
import { ProductMarketPattern, TableNames } from "./constants";
import { column, index, OrderDirection, pk, table } from "@decaf-ts/core";
import { composed } from "@decaf-ts/db-decorators";
import { description, uses } from "@decaf-ts/decoration";
import { FabricFlavour } from "../../../../src/shared/index";
import { FabricIdentifiedModel } from "./FabricIdentifiedModel";

@description("Links a product to a specific market.")
@uses(FabricFlavour)
@table(TableNames.Market)
@model()
export class Market extends FabricIdentifiedModel {
  @pk({ type: "String", generated: false })
  @composed(["productCode", "marketId"], ":", true)
  @description("Unique identifier composed of product code and market ID.")
  id!: string;

  @column()
  @required()
  @pattern(ProductMarketPattern)
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description(
    "Identifier of the market where the product is registered or sold."
  )
  marketId!: string;

  @column()
  @minlength(2)
  @maxlength(2)
  @description(
    "Two-letter national code (ISO format) representing the market's country."
  )
  nationalCode?: string;

  @column()
  @description("Name of the Marketing Authorization Holder (MAH).")
  mahName?: string;

  @column()
  @description(
    "Name of the legal entity responsible for the product in this market."
  )
  legalEntityName?: string;

  @column()
  @description(
    "Address of the Marketing Authorization Holder or responsible legal entity."
  )
  mahAddress?: string;

  constructor(model?: ModelArg<Market>) {
    super(model);
  }
}
