import "../../src/shared/overrides";
import { Model } from "@decaf-ts/decorator-validation";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { getMockCtx, getStubMock } from "./ContextMock";
import { OtherProductSharedContract } from "../../src/contract/OtherProductSharedContract";
import { OtherProductShared } from "../../src/contract/models/OtherProductShared";
import { OtherMarket } from "../../src/contract/models/OtherMarket";
import { OtherProductStrength } from "../../src/contract/models/OtherProductStrength";
import { GtinOwner } from "../../src/contract/models/GtinOwner";
import { generateGtin } from "../../src/contract/models/gtin";

describe("Product GTIN owner isolation", () => {
  let ctx: ReturnType<typeof getMockCtx>;
  let stub: ReturnType<typeof getStubMock>;
  let contract: OtherProductSharedContract;
  let transientSpy: jest.SpyInstance;

  beforeAll(() => {
    stub = getStubMock();
    ctx = getMockCtx();
    Object.assign(ctx, { stub });
    contract = new OtherProductSharedContract();
  });

  beforeEach(() => {
    ctx = getMockCtx();
    Object.assign(ctx, { stub });
    transientSpy = jest.spyOn(contract as any, "getTransientData");
  });

  afterEach(() => jest.restoreAllMocks());

  function ensureCommitted() {
    if (stub && typeof stub.commit === "function") {
      stub.commit();
    }
  }

  function buildStrength(productCode: string, strength: string) {
    return new OtherProductStrength({ productCode, strength });
  }

  function buildMarket(productCode: string, marketId: string) {
    return new OtherMarket({ productCode, marketId });
  }

  function preparePayload(model: OtherProductShared) {
    const segregated = Model.segregate(model);
    const transient = segregated.transient || {};
    transientSpy.mockImplementation(() => transient);
    return segregated.model;
  }

  async function loadProduct(productCode: string) {
    ensureCommitted();
    const k = stub.createCompositeKey("other_product_shared", [productCode]);
    const raw = await stub.getPrivateData("decaf-namespaceAeon", k);
    return new OtherProductShared(JSON.parse(raw.toString()));
  }

  function ownerKey(productCode: string) {
    return stub.createCompositeKey("owner", [productCode]);
  }

  async function loadOwner(productCode: string) {
    ensureCommitted();
    const raw = await stub.getState(ownerKey(productCode));
    return new GtinOwner(JSON.parse(raw.toString()));
  }

  async function expectOwnerOnlyPublic(productCode: string) {
    const owner = await loadOwner(productCode);
    expect(owner.productCode).toBe(productCode);
    expect(owner.ownedBy).toBe(ctx?.clientIdentity?.getMSPID?.());
    await expect(
      stub.getPrivateData("decaf-namespaceAeon", ownerKey(productCode))
    ).rejects.toThrow(NotFoundError);
  }

  async function expectOwnerMissing(productCode: string) {
    ensureCommitted();
    await expect(stub.getState(ownerKey(productCode))).rejects.toThrow(
      NotFoundError
    );
    await expect(
      stub.getPrivateData("decaf-namespaceAeon", ownerKey(productCode))
    ).rejects.toThrow(NotFoundError);
  }

  async function createProduct(productCode: string) {
    const model = new OtherProductShared({
      productCode,
      inventedName: "Owner Test Product",
      nameMedicinalProduct: "OwnerMed",
      strengths: [buildStrength(productCode, "3mg")],
      markets: [buildMarket(productCode, "us")],
    });
    const payload = preparePayload(model);
    await contract.create(ctx as any, payload.serialize());
    stub.commit();
  }

  it("stores GTIN owner only in the public state on create", async () => {
    const productCode = generateGtin();
    await createProduct(productCode);

    await expectOwnerOnlyPublic(productCode);
  });

  it("keeps GTIN owner in public state after an update", async () => {
    const productCode = generateGtin();
    await createProduct(productCode);

    const product = await loadProduct(productCode);
    product.inventedName = "Owner Test Product Updated";
    const payload = preparePayload(product);
    await contract.update(ctx as any, payload.serialize());
    stub.commit();

    await expectOwnerOnlyPublic(productCode);
  });

  it("removes GTIN owner when the product is deleted", async () => {
    const productCode = generateGtin();
    await createProduct(productCode);

    const payload = JSON.stringify(productCode);
    await contract.delete(ctx as any, productCode);
    stub.commit();

    await expectOwnerMissing(productCode);
  });

  it("bulk deletes products and their GTIN owners from public state", async () => {
    const codes = [generateGtin(), generateGtin()];
    for (const code of codes) {
      await createProduct(code);
    }

    await contract.deleteAll(ctx as any, JSON.stringify(codes));
    stub.commit();

    await Promise.all(codes.map((code) => expectOwnerMissing(code)));
  });
});
