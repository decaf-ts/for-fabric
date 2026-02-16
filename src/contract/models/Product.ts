import type { ModelArg } from "@decaf-ts/decorator-validation";
import { model, required } from "@decaf-ts/decorator-validation";
import {
  column,
  index,
  oneToMany,
  table,
  OrderDirection,
  pk,
  Cascade,
} from "@decaf-ts/core";
// import {BlockOperations, OperationKeys, readonly} from "@decaf-ts/db-decorators";
import { uses } from "@decaf-ts/decoration";
import { ProductStrength } from "./ProductStrength";
import { Market } from "./Market";
import { BaseIdentifiedModel } from "./BaseIdentifiedModel";
import { gtin } from "./gtin";

import { assignProductOwner, audit } from "./decorators";
import { FabricFlavour } from "../../shared/constants";

@uses(FabricFlavour)
// @BlockOperations([OperationKeys.DELETE])
@table()
@model()
export class Product extends BaseIdentifiedModel {
  @gtin()
  @audit(Product)
  @assignProductOwner()
  @pk()
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

  @column()
  counter?: number;

  @oneToMany(
    () => ProductStrength,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    true
  )
  strengths!: ProductStrength[];

  @oneToMany(
    () => Market,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    true
  )
  markets!: Market[];

  constructor(args?: ModelArg<Product>) {
    super(args);
  }
}
