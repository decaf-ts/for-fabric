import type { ModelArg } from "@decaf-ts/decorator-validation";
import { model, required } from "@decaf-ts/decorator-validation";
import { column, pk, table } from "@decaf-ts/core";
// import {BlockOperations, OperationKeys, readonly} from "@decaf-ts/db-decorators";
import { uses } from "@decaf-ts/decoration";
import { gtin } from "./gtin";
import {
  FabricFlavour,
  mirror,
  NamespaceCollection,
  ownedBy,
  sharedData,
} from "../../shared/index";
import { BaseIdentifiedModel } from "./BaseIdentifiedModel";

@sharedData(NamespaceCollection("decaf-namespace"))
@uses(FabricFlavour)
// @BlockOperations([OperationKeys.DELETE])
@table("other_product_shared")
@model()
export class OtherProductImage extends BaseIdentifiedModel {
  @pk()
  @gtin()
  @mirror("mirror-collection", "org-b")
  productCode!: string;

  @column()
  @required()
  content!: string;

  @ownedBy()
  owner!: string;

  constructor(model?: ModelArg<OtherProductImage>) {
    super(model);
  }
}
