import {
  Comparison,
  Model,
  type ModelArg,
} from "@decaf-ts/decorator-validation";
import { model, required } from "@decaf-ts/decorator-validation";
import {
  Cascade,
  column,
  defaultQueryAttr,
  index,
  oneToMany,
  oneToOne,
  OrderDirection,
  pk,
  table,
} from "@decaf-ts/core";
import { composed, readonly } from "@decaf-ts/db-decorators";
import { description, uses } from "@decaf-ts/decoration";
import { BaseIdentifiedModel } from "./BaseIdentifiedModel";
import {
  FabricFlavour,
  mirror,
  NamespaceCollection,
  ownedBy,
  sharedData,
} from "../../shared/index";
import { audit } from "./decorators-private";
import { historyDec } from "./history-dec";
import { gtin } from "./gtin";
import { OtherLeafletFile } from "./OtherLeafletFile";

@description(
  "Represents the ePI leaflet linked to a specific product, batch, and language."
)
@uses(FabricFlavour)
@table("other_leaflet")
@sharedData(NamespaceCollection("decaf-namespace"))
@model()
export class Leaflet extends BaseIdentifiedModel {
  @pk()
  @historyDec()
  @mirror("mirror-collection", "org-b")
  @audit(Leaflet)
  @composed(
    ["productCode", "batchNumber", "leafletType", "lang", "epiMarket"],
    ":",
    ["batchNumber", "epiMarket"]
  )
  @description(
    "Unique identifier composed of product code, batch number, and language."
  )
  id!: string;

  @gtin()
  @column()
  @required()
  @readonly()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("GTIN code of the product associated with this leaflet.")
  @defaultQueryAttr()
  productCode!: string;

  @column()
  @readonly()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Batch number linked to the product, if applicable.")
  @defaultQueryAttr()
  batchNumber?: string;

  @column()
  @required()
  @readonly()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Type category the leaflet belongs to.")
  leafletType: string = "leaflet";

  @column()
  @required()
  @readonly()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Language code of the leaflet (e.g., 'en', 'pt', 'es').")
  lang!: string; // TODO -> rollback to language property

  @column()
  @readonly()
  epiMarket!: string; // TODO -> Create validation decorator. CountryMarket is a CONDITIONAL property. can only exist for product only. no batch

  @column()
  @required()
  @description("Main XML content of the electronic leaflet.")
  @oneToOne(
    () => OtherLeafletFile,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    false
  )
  @description("file with the xml content of the leaflet")
  xmlFileContent!: string | OtherLeafletFile;

  @oneToMany(
    () => OtherLeafletFile,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    false
  )
  @description(
    "List of additional files linked to the leaflet, such as PDFs or images."
  )
  otherFilesContent!: string[] | OtherLeafletFile[];

  @ownedBy()
  @description("the owner (msp) of the leaflet")
  owner!: string;

  constructor(model?: ModelArg<Leaflet>) {
    super(model);
  }

  override compare<M extends Model>(
    other: M,
    ...exceptions: (keyof M)[]
  ): Comparison<M> | undefined {
    return super.compare<M>(
      other as any,
      ...([
        ...new Set([
          exceptions,
          "updatedAt",
          "updatedBy",
          "otherFilesContent",
          "xmlFileContent",
        ]).values(),
      ] as any[])
    );
  }
}
