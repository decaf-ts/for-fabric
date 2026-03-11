import type { ModelArg } from "@decaf-ts/decorator-validation";
import {
  maxlength,
  minlength,
  model,
  required,
} from "@decaf-ts/decorator-validation";
import { TableNames } from "./constants";
import {
  column,
  defaultQueryAttr,
  index,
  OrderDirection,
  pk,
  table,
} from "@decaf-ts/core";
import { composed, version } from "@decaf-ts/db-decorators";
import { description, uses } from "@decaf-ts/decoration";
import { BaseIdentifiedModel } from "./BaseIdentifiedModel";
import { gtin } from "./gtin";
import {
  FabricFlavour,
  mirror,
  NamespaceCollection,
  sharedData,
} from "../../shared/index";
import { historyDec } from "./history-dec";

@sharedData(NamespaceCollection("decaf-namespace"))
@description("Links a product to a specific market.")
@uses(FabricFlavour)
@table("other_market")
@model()
export class OtherMarket extends BaseIdentifiedModel {
  @pk({ type: String, generated: false })
  @historyDec()
  @mirror("mirror-collection", "org-b")
  @composed(["productCode", "marketId"], ":", true)
  @description("Unique identifier composed of product code and market ID.")
  id!: string;

  @column()
  @required()
  @defaultQueryAttr()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description(
    "Identifier of the market where the product is registered or sold."
  )
  marketId!: string;

  @column()
  @gtin()
  @required()
  @defaultQueryAttr()
  productCode!: string;

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

  @version()
  counter?: number;

  constructor(model?: ModelArg<OtherMarket>) {
    super(model);
  }
}
