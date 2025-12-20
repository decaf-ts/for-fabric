import type { ModelArg } from "@decaf-ts/decorator-validation";
import { model, required, url } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import { FabricFlavour } from "../../../src/shared";
import { column, index, OrderDirection, pk, table } from "@decaf-ts/core";
import { FabricIdentifiedBaseModel } from "../../../src/shared/model/FabricIdentifiedBaseModel";

// @BlockOperations([OperationKeys.DELETE])
@uses(FabricFlavour)
@table("Product")
@model()
export class Product extends FabricIdentifiedBaseModel {
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

  @column()
  flagEnableAdverseEventReporting?: boolean;

  @column()
  adverseEventReportingURL?: string;

  @column()
  flagEnableACFProductCheck?: boolean;

  @column()
  @url()
  acfProductCheckURL?: string;

  @column()
  patientSpecificLeaflet?: string;

  @column()
  healthcarePractitionerInfo?: string;

  constructor(args?: ModelArg<Product>) {
    super(args);
  }
}
