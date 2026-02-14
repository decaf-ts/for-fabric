import "../../src/shared/overrides";
import { Model } from "@decaf-ts/decorator-validation";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { Metadata } from "@decaf-ts/decoration";
import { getMockCtx, getStubMock } from "./ContextMock";
import { OtherProductSharedContract } from "../../src/contract/OtherProductSharedContract";
import { OtherProductShared } from "../../src/contract/models/OtherProductShared";
import { ProductStrength } from "../../src/contract/models/ProductStrength";
import { Market } from "../../src/contract/models/Market";
import { generateGtin } from "../../src/contract/models/gtin";

describe("OtherProductShared contract version flow with relations", () => {
  let ctx: ReturnType<typeof getMockCtx>;
  let stub: ReturnType<typeof getStubMock>;
  let contract: OtherProductSharedContract;
  let transientSpy: jest.SpyInstance;

  beforeAll(() => {
    ctx = getMockCtx();
    stub = (ctx as any).stub;
    contract = new OtherProductSharedContract();
  });

  beforeEach(() => {
    ctx = getMockCtx();
    Object.assign(ctx, { stub: stub });

    transientSpy = jest.spyOn(
      contract as any,
      "getTransientData" as any
    ) as jest.SpyInstance;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function buildMarket(productCode: string, suffix: string) {
    return new Market({
      productCode,
      marketId: `market-${suffix}`,
    });
  }

  function buildStrength(productCode: string, strength: string) {
    return new ProductStrength({
      productCode,
      strength,
    });
  }

  function preparePayload(model: OtherProductShared) {
    const segregated = Model.segregate(model);
    const transient = segregated.transient || {};

    transientSpy.mockImplementation(() => transient);
    return segregated.model;
  }

  let productCode: string = "";
  let created: OtherProductShared;

  it.skip("holds the correct metadata", () => {
    const instance = new OtherProductShared();
    const properties = Metadata.properties(OtherProductShared);
    const validatableProperties =
      Metadata.validatableProperties(OtherProductShared);
    const keys = Object.keys(instance);
    expect(properties.length).toEqual(keys.length); // own-class properties only
    expect(validatableProperties.length).toEqual(keys.length);
  });

  it("creates with shared data", async () => {
    productCode = generateGtin();
    const baseModel = new OtherProductShared({
      productCode,
      inventedName: "initial-name",
      nameMedicinalProduct: "medicinal",
      strengths: [buildStrength(productCode, "100mg")],
      markets: [buildMarket(productCode, "us")],
    });

    const payload = preparePayload(baseModel);
    created = Model.deserialize(
      await contract.create(ctx as any, payload.serialize())
    ) as OtherProductShared;
    stub.commit();

    expect(created.hasErrors()).toBeDefined(); // the contract doesnt return transient data, so the model should come back completely empty, forcing a subsequent read

    const k = stub.createCompositeKey("other_product_shared", [productCode]);
    await expect(stub.getState(k)).rejects.toThrow(NotFoundError);
    const sharedState = await stub.getPrivateData("decaf-namespaceAeon", k);
    expect(
      new OtherProductShared(JSON.parse(sharedState)).hasErrors()
    ).toBeUndefined();
  });

  it("reads the shared data", async () => {
    const read = Model.deserialize(
      await contract.read(ctx as any, productCode)
    ) as OtherProductShared;
    expect(read.hasErrors()).toBeUndefined();
    created = read;
  });

  let updated: OtherProductShared;

  it("updates the shared product", async () => {
    const updatedModel = new OtherProductShared({
      ...created,
      inventedName: "updated-name",
      strengths: [
        ...(created.strengths || []),
        buildStrength(created.productCode, "200mg"),
      ],
      markets: [
        ...(created.markets || []),
        buildMarket(created.productCode, "eu"),
      ],
    });

    const updatePayload = preparePayload(updatedModel);
    updated = Model.deserialize(
      await contract.update(ctx as any, updatePayload.serialize())
    ) as OtherProductShared;
    stub.commit();

    expect(updated.hasErrors()).toBeDefined();

    const k = stub.createCompositeKey("other_product_shared", [productCode]);
    await expect(stub.getState(k)).rejects.toThrow(NotFoundError);
    const sharedState = await stub.getPrivateData("decaf-namespaceAeon", k);
    updated = new OtherProductShared(JSON.parse(sharedState));
    expect(updated.hasErrors()).toBeUndefined();

    expect(updated.version).toBe(2);
    expect(updated.strengths).toHaveLength(2);
    expect(updated.markets).toHaveLength(2);

    const read = Model.deserialize(
      await contract.read(ctx as any, created.productCode)
    ) as OtherProductShared;

    expect(read.equals(updated)).toBe(true);
  });

  it.skip("deletes the shared product", async () => {
    const deleted = Model.deserialize(
      await contract.delete(ctx as any, created.productCode)
    ) as OtherProductShared;

    expect(deleted.hasErrors()).toBeDefined();

    const k = stub.createCompositeKey("other_product_shared", [productCode]);
    await expect(stub.getState(k)).rejects.toThrow(NotFoundError);
    await expect(stub.getPrivateData("decaf-namespaceAeon", k)).rejects.toThrow(
      NotFoundError
    );
  });
});
