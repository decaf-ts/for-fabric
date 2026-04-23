import "../../src/shared/overrides";
import { Model } from "@decaf-ts/decorator-validation";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { getMockCtx, getStubMock } from "./ContextMock";
import { OtherProductSharedContract } from "../../src/contract/OtherProductSharedContract";
import { OtherProductShared } from "../../src/contract/models/OtherProductShared";
import { GtinOwner } from "../../src/contract/models/GtinOwner";
import { generateGtin } from "../../src/contract/models/gtin";
import { FabricContractContext } from "../../src/contracts/ContractContext";

const SHARED_COLLECTION = "decaf-namespaceAeon";
const MIRROR_COLLECTION = "mirror-collection";
const PRODUCT_TABLE = "other_product_shared";
const OWNER_TABLE = "owner";

describe("OtherProductShared CRUD isolation with GtinOwner", () => {
  let ctx: ReturnType<typeof getMockCtx>;
  let stub: ReturnType<typeof getStubMock>;
  let contract: OtherProductSharedContract;
  let transientSpy: jest.SpyInstance;

  beforeAll(() => {
    Object.defineProperty(FabricContractContext.prototype, "log", {
      configurable: true,
      get(this: FabricContractContext) {
        return this.logger;
      },
    });
  });

  beforeEach(() => {
    stub = getStubMock();
    ctx = getMockCtx();
    Object.assign(ctx, { stub });
    (ctx as any).log = (ctx as any).logging?.getLogger?.("test-owner-crud");
    contract = new OtherProductSharedContract();
    transientSpy = jest.spyOn(contract as any, "getTransientData");
  });

  afterEach(() => jest.restoreAllMocks());

  function ensureCommitted() {
    if (stub && typeof stub.commit === "function") stub.commit();
  }

  function productKey(productCode: string) {
    return stub.createCompositeKey(PRODUCT_TABLE, [productCode]);
  }

  function ownerKey(productCode: string) {
    return stub.createCompositeKey(OWNER_TABLE, [productCode]);
  }

  function buildProduct(productCode: string, suffix: string) {
    return new OtherProductShared({
      productCode,
      inventedName: `invented-${suffix}`,
      nameMedicinalProduct: `med-${suffix}`,
    });
  }

  function preparePayload(model: OtherProductShared) {
    const segregated = Model.segregate(model);
    transientSpy.mockImplementation(() => segregated.transient || {});
    return segregated.model.serialize();
  }

  function preparePayloadBulk(model: OtherProductShared[]) {
    const segregated = model.map((m) => Model.segregate(m));
    transientSpy.mockImplementation(() => segregated.map((s) => s.transient || {}));
    return JSON.stringify(segregated.map((s) => s.model.serialize()));
  }

  async function loadPrivateProduct(productCode: string) {
    ensureCommitted();
    const raw = await stub.getPrivateData(SHARED_COLLECTION, productKey(productCode));
    return new OtherProductShared(JSON.parse(Buffer.from(raw).toString("utf8")));
  }

  async function loadPublicOwner(productCode: string) {
    ensureCommitted();
    const raw = await stub.getState(ownerKey(productCode));
    return new GtinOwner(JSON.parse(Buffer.from(raw).toString("utf8")));
  }

  async function expectProductPrivateOnly(productCode: string) {
    const product = await loadPrivateProduct(productCode);
    expect(product.productCode).toBe(productCode);

    await expect(stub.getState(productKey(productCode))).rejects.toThrow(
      NotFoundError
    );
  }

  async function expectOwnerPublicOnly(productCode: string) {
    const owner = await loadPublicOwner(productCode);
    expect(owner.productCode).toBe(productCode);
    expect(owner.ownedBy).toBe(ctx.clientIdentity.getMSPID());

    await expect(
      stub.getPrivateData(SHARED_COLLECTION, ownerKey(productCode))
    ).rejects.toThrow(NotFoundError);
    await expect(
      stub.getPrivateData(MIRROR_COLLECTION, ownerKey(productCode))
    ).rejects.toThrow(NotFoundError);
  }

  async function expectDeletedWithoutLeakage(productCode: string) {
    ensureCommitted();
    await expect(stub.getPrivateData(SHARED_COLLECTION, productKey(productCode))).rejects.toThrow(
      NotFoundError
    );
    await expect(stub.getState(productKey(productCode))).rejects.toThrow(
      NotFoundError
    );
    await expect(stub.getState(ownerKey(productCode))).rejects.toThrow(
      NotFoundError
    );
    await expect(
      stub.getPrivateData(SHARED_COLLECTION, ownerKey(productCode))
    ).rejects.toThrow(NotFoundError);
  }

  it("runs single CRUD and keeps product private while owner remains public", async () => {
    const productCode = generateGtin();
    const base = buildProduct(productCode, "single-create");

    await contract.create(ctx as any, preparePayload(base));
    stub.commit();

    await expectProductPrivateOnly(productCode);
    await expectOwnerPublicOnly(productCode);

    const read = Model.deserialize(
      await contract.read(ctx as any, productCode)
    ) as OtherProductShared;
    expect(read.productCode).toBe(productCode);

    const updated = new OtherProductShared({
      ...read,
      inventedName: "single-updated",
      nameMedicinalProduct: "single-updated-med",
    });
    await contract.update(ctx as any, preparePayload(updated));
    stub.commit();

    const updatedPrivate = await loadPrivateProduct(productCode);
    expect(updatedPrivate.inventedName).toBe("single-updated");
    expect(updatedPrivate.nameMedicinalProduct).toBe("single-updated-med");
    await expectOwnerPublicOnly(productCode);

    await contract.delete(ctx as any, productCode);
    stub.commit();
    await expectDeletedWithoutLeakage(productCode);
  });

  it("runs bulk CRUD and enforces private/public separation with no data leakage", async () => {
    const codes = [generateGtin(), generateGtin(), generateGtin()];
    const models = codes.map((code, i) => buildProduct(code, `bulk-create-${i}`));

    const created = JSON.parse(
      await contract.createAll(ctx as any, preparePayloadBulk(models))
    );
    expect(created).toHaveLength(codes.length);
    stub.commit();

    for (const code of codes) {
      await expectProductPrivateOnly(code);
      await expectOwnerPublicOnly(code);
    }

    const bulkRead = JSON.parse(
      await contract.readAll(ctx as any, JSON.stringify(codes))
    ).map((entry: any) => Model.deserialize(entry) as OtherProductShared);
    expect(bulkRead).toHaveLength(codes.length);
    expect(new Set(bulkRead.map((p) => p.productCode)).size).toBe(codes.length);

    const updates = codes.map(
      (code, i) =>
        new OtherProductShared({
          productCode: code,
          inventedName: `bulk-updated-${i}`,
        })
    );
    const updated = JSON.parse(
      await contract.updateAll(ctx as any, preparePayloadBulk(updates))
    );
    expect(updated).toHaveLength(codes.length);
    stub.commit();

    for (let i = 0; i < codes.length; i++) {
      const product = await loadPrivateProduct(codes[i]);
      expect(product.inventedName).toBe(`bulk-updated-${i}`);
      await expectOwnerPublicOnly(codes[i]);
    }

    await contract.deleteAll(ctx as any, JSON.stringify(codes));
    stub.commit();

    for (const code of codes) {
      await expectDeletedWithoutLeakage(code);
    }
  });
});
