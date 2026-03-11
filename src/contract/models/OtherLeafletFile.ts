import type { ModelArg } from "@decaf-ts/decorator-validation";
import { model, required } from "@decaf-ts/decorator-validation";
import { column, index, OrderDirection, pk, table } from "@decaf-ts/core";
import { description, uses } from "@decaf-ts/decoration";
import { composed } from "@decaf-ts/db-decorators";
import { BaseIdentifiedModel } from "./BaseIdentifiedModel";
import {
  FabricFlavour,
  mirror,
  NamespaceCollection,
  ownedBy,
  sharedData,
} from "../../shared/index";

@description(
  "Represents an additional file associated with a leaflet, such as a PDF or image."
)
@uses(FabricFlavour)
@table("other_leaflet_file")
@sharedData(NamespaceCollection("decaf-namespace"))
@model()
export class OtherLeafletFile extends BaseIdentifiedModel {
  @pk()
  @mirror("mirror-collection", "org-b")
  @composed(["leafletId", "fileName"], ":")
  @description("Unique identifier of the leaflet file.")
  id!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Identifier of the leaflet this file belongs to.")
  leafletId!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Name of the file, including its extension.")
  fileName!: string;

  @column()
  @required()
  @description("Base64-encoded content of the file.")
  fileContent!: string;

  @ownedBy()
  @description("the owner (msp) of the leaflet")
  owner!: string;

  constructor(model?: ModelArg<OtherLeafletFile>) {
    super(model);
  }
}
