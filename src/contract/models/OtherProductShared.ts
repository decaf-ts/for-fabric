import type { ModelArg } from "@decaf-ts/decorator-validation";
import { model, required } from "@decaf-ts/decorator-validation";
import {
  Cascade,
  column,
  index,
  oneToMany,
  OrderDirection,
  pk,
  table,
} from "@decaf-ts/core";
// import {BlockOperations, OperationKeys, readonly} from "@decaf-ts/db-decorators";
import { uses } from "@decaf-ts/decoration";
import { BaseIdentifiedModel } from "./BaseIdentifiedModel";
import { gtin } from "./gtin";
import { audit } from "./decorators";
import {
  FabricFlavour,
  mirror,
  NamespaceCollection,
  ownedBy,
  sharedData,
} from "../../shared/index";
import { version } from "@decaf-ts/db-decorators";
import { ProductStrength } from "./ProductStrength";
import { Market } from "./Market";

@sharedData(NamespaceCollection("decaf-namespace"))
@uses(FabricFlavour)
// @BlockOperations([OperationKeys.DELETE])
@table("other_product_shared")
@model()
export class OtherProductShared extends BaseIdentifiedModel {
  @pk()
  @gtin()
  // @mirror("mirror-collection", "org-a")
  @audit(OtherProductShared)
  productCode!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  inventedName!: string;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  nameMedicinalProduct!: string;

  @column()
  internalMaterialCode?: string;

  @column()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  productRecall: boolean = false;
  //
  // @column()
  // flagEnableAdverseEventReporting?: boolean;
  //
  // @column()
  // adverseEventReportingURL?: string;
  //
  // @column()
  // flagEnableACFProductCheck?: boolean;
  //
  // @column()
  // @url()
  // acfProductCheckURL?: string;
  //
  // @column()
  // patientSpecificLeaflet?: string;
  //
  // @column()
  // healthcarePractitionerInfo?: string;

  @version()
  counter?: number;

  @oneToMany(
    () => ProductStrength,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    false
  )
  strengths!: ProductStrength[];

  @oneToMany(
    () => Market,
    { update: Cascade.NONE, delete: Cascade.NONE },
    false
  )
  markets!: Market[];

  @column()
  @ownedBy()
  ownedBy?: string;

  constructor(args?: ModelArg<OtherProductShared>) {
    super(args);
  }
}
