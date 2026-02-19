import type { ModelArg } from "@decaf-ts/decorator-validation";
import { date, model, pattern, required } from "@decaf-ts/decorator-validation";
import { column, index, OrderDirection, pk, table } from "@decaf-ts/core";
import { BatchPattern, DatePattern, TableNames } from "./constants";
import {
  BlockOperations,
  composed,
  OperationKeys,
  readonly,
} from "@decaf-ts/db-decorators";
import { description, uses } from "@decaf-ts/decoration";
import { BaseIdentifiedModel } from "./BaseIdentifiedModel";
import { audit } from "./decorators";
import { gtin } from "./gtin";
import {
  FabricFlavour,
  mirror,
  NamespaceCollection,
  sharedData,
} from "../../shared/index";

@sharedData(NamespaceCollection("decaf-namespace"))
@description("Represents a product batch")
@uses(FabricFlavour)
@BlockOperations([OperationKeys.DELETE])
@table("other_batch_shared")
@model()
export class OtherBatchShared extends BaseIdentifiedModel {
  @pk()
  @audit(OtherBatchShared)
  @mirror("mirror-collection", "org-b")
  @composed(["productCode", "batchNumber"], ":")
  @description("Unique identifier composed of product code and batch number.")
  id!: string;

  @gtin()
  @readonly()
  // @manyToOne(
  //   () => Product,
  //   { update: Cascade.NONE, delete: Cascade.NONE },
  //   false
  // )
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Code of the product associated with this batch.")
  productCode!: string;

  @column()
  @readonly()
  @pattern(BatchPattern)
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Batch number assigned to the product.")
  batchNumber!: string;

  @required()
  @date(DatePattern)
  @column()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Date when the batch expires.")
  expiryDate!: Date;

  @column()
  @description("Import license number for this batch.")
  importLicenseNumber?: string;

  @column()
  @date(DatePattern)
  @description("Date when the batch was manufactured.")
  dateOfManufacturing?: string;

  @column()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Name of the product manufacturer.")
  manufacturerName?: string;

  @column()
  @description("Manufacturer address line 1.")
  manufacturerAddress1?: string;

  @column()
  @description("Manufacturer address line 2.")
  manufacturerAddress2?: string;

  @column()
  @description("Manufacturer address line 3.")
  manufacturerAddress3?: string;

  @column()
  @description("Manufacturer address line 4.")
  manufacturerAddress4?: string;

  @column()
  @description("Manufacturer address line 5.")
  manufacturerAddress5?: string;

  @column()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Indicates whether this batch has been recalled.")
  batchRecall: boolean = false;

  constructor(model?: ModelArg<OtherBatchShared>) {
    super(model);
  }
}
