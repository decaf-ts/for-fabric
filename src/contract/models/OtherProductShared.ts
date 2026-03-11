import type { ModelArg } from "@decaf-ts/decorator-validation";
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
// import {BlockOperations, OperationKeys, readonly} from "@decaf-ts/db-decorators";
import { uses } from "@decaf-ts/decoration";
import { BaseIdentifiedModel } from "./BaseIdentifiedModel";
import { gtin } from "./gtin";
import { audit } from "./decorators-private";
import {
  FabricFlavour,
  mirror,
  NamespaceCollection,
  ownedBy,
  sharedData,
} from "../../shared/index";
import { version } from "@decaf-ts/db-decorators";
import { OtherProductStrength } from "./OtherProductStrength";
import { OtherMarket } from "./OtherMarket";
import { assignProductOwner } from "./decorators";
import { historyDec } from "./history-dec";
import { OtherProductImage } from "./OtherProductImage";

@sharedData(NamespaceCollection("decaf-namespace"))
@uses(FabricFlavour)
// @BlockOperations([OperationKeys.DELETE])
@table("other_product_shared")
@model()
export class OtherProductShared extends BaseIdentifiedModel {
  @pk()
  @gtin()
  @historyDec()
  @assignProductOwner()
  @mirror("mirror-collection", "org-b")
  @audit(OtherProductShared)
  @defaultQueryAttr()
  productCode!: string;

  @column()
  @required()
  @defaultQueryAttr()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  inventedName!: string;

  @column()
  @required()
  @defaultQueryAttr()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  nameMedicinalProduct!: string;

  @column()
  internalMaterialCode?: string;

  @column()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  productRecall: boolean = false;

  @oneToOne(
    () => OtherProductImage,
    {
      update: Cascade.CASCADE,
      delete: Cascade.CASCADE,
    },
    false
  )
  imageData?: string | OtherProductImage;
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
    () => OtherProductStrength,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    true
  )
  strengths!: OtherProductStrength[];

  @oneToMany(
    () => OtherMarket,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    true
  )
  markets!: OtherMarket[];

  @column()
  @ownedBy()
  ownedBy?: string;

  constructor(args?: ModelArg<OtherProductShared>) {
    super(args);
  }
}
