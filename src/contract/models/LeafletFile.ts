import type { ModelArg } from "@decaf-ts/decorator-validation";
import { model, required } from "@decaf-ts/decorator-validation";
import {
  Cascade,
  column,
  index,
  manyToOne,
  OrderDirection,
  pk,
  table,
} from "@decaf-ts/core";
import { TableNames } from "./constants";
import { Leaflet } from "./Leaflet";
import { description, uses } from "@decaf-ts/decoration";
import { BaseIdentifiedModel } from "./BaseIdentifiedModel";
import { composed } from "@decaf-ts/db-decorators";
import { FabricFlavour } from "../../shared/index";
@description(
  "Represents an additional file associated with a leaflet, such as a PDF or image."
)
@uses(FabricFlavour)
@table(TableNames.LeafletFile)
@model()
export class LeafletFile extends BaseIdentifiedModel {
  @pk()
  @composed(["productCode", "batchNumber", "lang"], ":", ["batchNumber"])
  @description("Unique identifier of the leaflet file.")
  id!: string;

  @manyToOne(
    () => Leaflet,
    { update: Cascade.NONE, delete: Cascade.NONE },
    false
  )
  @description("Identifier of the leaflet this file belongs to.")
  leafletId!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Name of the file, including its extension.")
  filename!: string;

  @column()
  @required()
  @description("Base64-encoded content of the file.")
  fileContent!: string;

  constructor(model?: ModelArg<LeafletFile>) {
    super(model);
  }
}
