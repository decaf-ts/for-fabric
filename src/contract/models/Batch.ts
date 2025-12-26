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
import { FabricFlavour } from "../../shared/index";

@description("Represents a product batch")
@uses(FabricFlavour)
@BlockOperations([OperationKeys.DELETE])
@table(TableNames.Batch)
@model()
export class Batch extends BaseIdentifiedModel {
  @pk({ type: String, generated: false })
  @audit()
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

  // @column()
  // @description("Name of the site where the product was packaged.")
  // packagingSiteName?: string;
  //
  // @column()
  // @description("Version of the electronic product information leaflet.")
  // epiLeafletVersion?: number;
  //
  // @column()
  // @description("Enables expiry date verification feature.")
  // flagEnableEXPVerification: boolean = false;
  //
  // @column()
  // @description("Allows checking for expired batches.")
  // flagEnableExpiredEXPCheck: boolean = false;
  //
  // @column()
  // @description("Custom message displayed for this batch.")
  // batchMessage?: string;
  //
  // @column()
  // @description("Enables display of recall messages for this batch.")
  // flagEnableBatchRecallMessage: boolean = false;
  //
  // @column()
  // @description("Message shown when the batch is recalled.")
  // recallMessage?: string;
  //
  // @column()
  // @description("Enables ACF batch verification feature.")
  // flagEnableACFBatchCheck: boolean = false;
  //
  // @column()
  // @description("URL for ACF batch verification.")
  // acfBatchCheckURL?: string;
  //
  // @column()
  // @description("Enables serial number (SN) verification feature.")
  // flagEnableSNVerification: boolean = false;
  //
  // /** ACDC PATCH */
  // @column()
  // @description("Identifier of the ACDC authentication feature (SSI).")
  // acdcAuthFeatureSSI?: string;
  //
  // @column()
  // @description("Indicates if serial number validation was reset.")
  // snValidReset: boolean = false;

  // TODO -> Uncomment and fix
  // @column({ type: "text", array: true })
  // @list(String)
  // @description("List of valid serial numbers for the batch.")
  // snValid?: string[];

  constructor(model?: ModelArg<Batch>) {
    super(model);
  }
}
