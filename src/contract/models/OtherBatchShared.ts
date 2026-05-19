import type { ModelArg } from "@decaf-ts/decorator-validation";
import {
  date,
  JSONSerializer,
  list,
  minlength,
  Model,
  model,
  ModelKeys,
  pattern,
  required,
} from "@decaf-ts/decorator-validation";
import {
  column,
  Condition,
  defaultQueryAttr,
  index,
  OrderDirection,
  pk,
  table,
} from "@decaf-ts/core";
import { BatchPattern, DatePattern } from "./constants";
import {
  BlockOperations,
  composed,
  OperationKeys,
  readonly,
  serialize,
  version,
} from "@decaf-ts/db-decorators";
import { Constructor, description, Metadata, uses } from "@decaf-ts/decoration";
import { BaseIdentifiedModel } from "./BaseIdentifiedModel";
import { audit } from "./decorators-private";
import { gtin } from "./gtin";
import {
  FabricFlavour,
  mirror,
  NamespaceCollection,
  ownedBy,
  sharedData,
} from "../../shared/index";
import { historyDec } from "./history-dec";
// import { historyDec } from "./history-dec";

export class ArraySerializer<M extends Model> extends JSONSerializer<M> {
  constructor() {
    super();
  }

  /**
   * @summary prepares the model for serialization
   * @description returns a shallow copy of the object, containing an enumerable {@link ModelKeys#ANCHOR} property
   * so the object can be recognized upon deserialization
   *
   * @param {any} value
   * @protected
   */
  protected override preSerialize(value: any, ...args: any[]) {
    return this.serializeValue(value, ...args);
  }

  /**
   * @summary Rebuilds a model from a serialization
   * @param {string} str
   *
   * @throws {Error} If it fails to parse the string, or to build the model
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override deserialize(str: string, ...args: any[]): M {
    const deserialization = JSON.parse(str);
    return this.rebuildValue(deserialization) as M;
  }

  private serializeValue(value: any, ...args: any[]): any {
    if (value === undefined || value === null) return value;
    if (typeof value !== "object") return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
      return value.map((item) => this.serializeValue(item, ...args));
    }
    if (Model.isModel(value)) {
      return this.serializeModel(value, ...args);
    }
    return this.serializePlain(value, ...args);
  }

  private serializeModel(value: Model, ...args: any[]): Record<string, any> {
    const serialized = this.serializePlain(
      value as Record<string, any>,
      ...args
    );
    const metadata =
      this.getMetadata(value.constructor as Constructor) ??
      value.constructor?.name;
    if (metadata) serialized[ModelKeys.ANCHOR] = metadata;
    return serialized;
  }

  private serializePlain(
    value: Record<string, any>,
    ...args: any[]
  ): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = this.serializeValue(child, ...args);
    }
    return result;
  }

  private getMetadata(constructor: Constructor): string | undefined {
    try {
      return Metadata.modelName(constructor);
    } catch {
      return undefined;
    }
  }

  private rebuildValue(value: any): any {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) {
      return value.map((item) => this.rebuildValue(item));
    }
    const anchor = value[ModelKeys.ANCHOR];
    const rebuilt = this.rebuildObject(value);
    if (!anchor) return rebuilt;
    if (anchor === "??condition") return Condition.from(rebuilt);
    return Model.build(rebuilt, anchor);
  }

  private rebuildObject(value: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === ModelKeys.ANCHOR) continue;
      result[key] = this.rebuildValue(child);
    }
    return result;
  }

  /**
   * @summary Serializes a model
   * @param {T} model
   *
   * @throws {Error} if fails to serialize
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override serialize(model: M, ...args: any[]): string {
    return JSON.stringify(this.preSerialize(model));
  }
}

@model()
class ManufacturerAddress extends Model {
  @minlength(2)
  address!: string;

  constructor(arg?: ModelArg<ManufacturerAddress>) {
    super(arg);
  }
}

@sharedData(NamespaceCollection("decaf-namespace"))
@description("Represents a product batch")
@uses(FabricFlavour)
@BlockOperations([OperationKeys.DELETE])
@table("other_batch_shared")
@model()
export class OtherBatchShared extends BaseIdentifiedModel {
  @pk()
  @audit(OtherBatchShared)
  @historyDec()
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
  @defaultQueryAttr()
  productCode!: string;

  @column()
  @readonly()
  @pattern(BatchPattern)
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Batch number assigned to the product.")
  @defaultQueryAttr()
  batchNumber!: string;

  @required()
  @column()
  @date("yyyy-MM-dd HH:mm:ss")
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Date when the batch expires.")
  expiryDate!: Date;

  @column()
  @description("Import license number for this batch.")
  importLicenseNumber?: string;

  @column()
  @description("Date when the batch was manufactured.")
  @date(DatePattern)
  dateOfManufacturing?: Date;

  @column()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Name of the product manufacturer.")
  manufacturerName?: string;

  @serialize(ArraySerializer)
  @column()
  @list(ManufacturerAddress)
  @description("Manufacturer address")
  manufacturerAddress?: ManufacturerAddress[];

  @column()
  @description("Name of the site where the product was packaged.")
  packagingSiteName?: string;

  @column()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Indicates whether this batch has been recalled.")
  batchRecall: boolean = false;

  @ownedBy()
  @description("the owner (msp) of the batch")
  owner!: string;

  @version()
  override version!: number;

  constructor(model?: ModelArg<OtherBatchShared>) {
    super(model);
  }
}
