import type { ModelArg } from "@decaf-ts/decorator-validation";
import { model, required } from "@decaf-ts/decorator-validation";
import { LeafletFile } from "./LeafletFile";
import { gtin } from "./gtin";
import { TableNames } from "./constants";
import {
  Cascade,
  column,
  index,
  manyToOne,
  oneToMany,
  OrderDirection,
  pk,
  table,
} from "@decaf-ts/core";
import { composed, readonly } from "@decaf-ts/db-decorators";
import { Product } from "./Product";
import { description, uses } from "@decaf-ts/decoration";
import { BaseIdentifiedModel } from "./BaseIdentifiedModel";
import { audit } from "./decorators";
import { FabricFlavour } from "../../shared/index";

@description(
  "Represents a medical leaflet linked to a specific product, batch, and language."
)
@uses(FabricFlavour)
@table(TableNames.Leaflet)
@model()
export class Leaflet extends BaseIdentifiedModel {
  @audit(Leaflet)
  @pk()
  @composed(["productCode", "batchNumber", "lang", "countryMarket"], ":", [
    "batchNumber",
    "countryMarket",
  ])
  @description(
    "Unique identifier composed of product code, batch number, and language."
  )
  id!: string;

  @gtin()
  @manyToOne(
    () => Product,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    false
  )
  @required()
  @readonly()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("GTIN code of the product associated with this leaflet.")
  productCode!: string;

  @column()
  //TODO: Uncomment when implemented in couch and FK relationshipacept composed one
  // @manyToOne(
  //   () => Batch,
  //   { update: Cascade.CASCADE, delete: Cascade.CASCADE },
  //   false
  // )
  @readonly()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Batch number linked to the product, if applicable.")
  batchNumber?: string;

  @column()
  @required()
  @readonly()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Language code of the leaflet (e.g., 'en', 'pt', 'es').")
  lang!: string; // TODO -> rollback to language property

  @column()
  @required()
  @readonly()
  countryMarket!: string;

  @column()
  @required()
  @description("Main XML content of the electronic leaflet.")
  xmlFileContent!: string;

  @oneToMany(
    () => LeafletFile,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    false
  )
  @description(
    "List of additional files linked to the leaflet, such as PDFs or images."
  )
  otherFilesContent!: string[];

  constructor(model?: ModelArg<Leaflet>) {
    super(model);
  }
}
