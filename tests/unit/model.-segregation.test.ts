import {
  model,
  Model,
  ModelArg,
  required,
  url,
} from "@decaf-ts/decorator-validation";
import { column, pk, table } from "@decaf-ts/core";
import { description, uses } from "@decaf-ts/decoration";
import { transient } from "@decaf-ts/db-decorators";
import { FabricFlavour } from "../../src/shared/constants";
import { ownedBy } from "../../src/shared/decorators";
import { generateGtin, gtin } from "../../src/contract/models/gtin";

import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
@uses(FabricFlavour)
@table("gtin")
@model()
export class GtinOwner extends Model {
  @pk()
  // @gtin()
  @description("The product code associated with this GTIN owner.")
  productCode!: string;

  // @cache()
  @column()
  @ownedBy()
  @required()
  @description("The owner of this GTIN. (Fabric's MSP ID of the MAH)")
  ownedBy!: string;

  @column()
  @url()
  @transient()
  @description(
    "The url matching the owner's endpoint - only exists for caching purposes, sourced from entity"
  )
  endpoint?: string;

  constructor(model?: ModelArg<GtinOwner>) {
    super(model);
  }
}

describe("Model segregation", () => {
  it("splits GTInOwners", () => {
    const productCode = generateGtin();
    const gtin = new GtinOwner({
      productCode,
      ownedBy: "owner",
      endpoint: "https://api.gtin.com/v1/products",
    });
    expect(gtin).toBeDefined();
    expect(gtin.productCode).toBeDefined();
    expect(gtin.ownedBy).toBeDefined();
    expect(gtin.endpoint).toBeDefined();
    const split = gtin.segregate();
    expect(split).toBeDefined();

    const { privates, shared, model, transient } = split;

    expect(privates).toEqual({});
    expect(shared).toBeDefined();
    expect(model).toEqual(
      expect.objectContaining({
        productCode: productCode,
        ownedBy: "owner",
      })
    );
    expect(transient).toEqual(
      expect.objectContaining({
        endpoint: "https://api.gtin.com/v1/products",
      })
    );
  });
});
