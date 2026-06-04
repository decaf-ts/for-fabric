import type { ModelArg } from "@decaf-ts/decorator-validation";
import { model, required } from "@decaf-ts/decorator-validation";
import { column, index, OrderDirection, pk, table } from "@decaf-ts/core";
// import {BlockOperations, OperationKeys, readonly} from "@decaf-ts/db-decorators";
import { uses } from "@decaf-ts/decoration";
import { BaseIdentifiedModel } from "../models/BaseIdentifiedModel";
import { gtin } from "../models/gtin";

import { audit } from "../models/decorators";
import {
  FabricFlavour,
  mirror,
  ownedBy,
} from "../../shared/index";
import { version } from "@decaf-ts/db-decorators";
import { historyDec } from "../models/history-dec";

// @privateData()
@uses(FabricFlavour)
// @BlockOperations([OperationKeys.DELETE])
@table("other_product")
@model()
export class OtherProduct extends BaseIdentifiedModel {
  @pk()
  @gtin()
  @historyDec()
  @mirror("mirror-collection", "PharmaledgerassocMSP")
  @audit(OtherProduct)
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
  //
  // @oneToMany(
  //   () => ProductStrength,
  //   { update: Cascade.CASCADE, delete: Cascade.CASCADE },
  //   false
  // )
  // strengths!: ProductStrength[];
  //
  // @oneToMany(
  //   () => Market,
  //   { update: Cascade.NONE, delete: Cascade.NONE },
  //   false
  // )
  // markets!: Market[];

  @column()
  @ownedBy()
  ownedBy?: string;

  constructor(args?: ModelArg<OtherProduct>) {
    super(args);
  }
}
