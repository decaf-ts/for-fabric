import "../../src/shared/overrides";
import { Model } from "@decaf-ts/decorator-validation";
import { FabricContractAdapter } from "../../src/contracts/ContractAdapter";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import { OtherProductShared } from "../../src/contract/trackedModels/OtherProductShared";
import { getIdentityMock, getStubMock } from "./ContextMock";

const collection = "decaf-namespaceAeon";
const auditFields = ["createdAt", "updatedAt", "id", "userId", "transaction", "diffs", "owner", "version", "model", "action", "recordId", "userGroup"];

describe("model-scoped private write plans", () => {
  function setup() {
    const stub = getStubMock();
    const logger = { for: jest.fn().mockReturnThis(), clear: jest.fn().mockReturnThis(), info: jest.fn(), error: jest.fn(), verbose: jest.fn(), debug: jest.fn(), silly: jest.fn(), warn: jest.fn() };
    const ctx = new FabricContractContext().accumulate({
      stub: stub as any, identity: getIdentityMock() as any, logger: logger as any,
      operation: "update", allowMirroring: true,
    });
    const adapter = new FabricContractAdapter(undefined as any, `scoped-plan-${Math.random()}`);
    const product = new OtherProductShared({
      productCode: "12345678901231", inventedName: "Updated product",
      nameMedicinalProduct: "Medicinal product", createdBy: "creator", updatedBy: "updater",
      owner: "Aeon", version: 2,
    });
    const table = Model.tableName(OtherProductShared);
    // Register Product's plan, then reproduce the nested public-owner/Audit
    // context state captured from the failing running contract.
    (ctx.writeTo as any)(collection, Object.keys(Model.segregate(product).transient!), table);
    ctx.put("segregateWrite", undefined);
    (ctx.writeTo as any)(collection, auditFields, "audit");
    return { stub, ctx, adapter, product, table };
  }

  it("persists complete Product values even when the unscoped plan contains only Audit fields", async () => {
    const { stub, ctx, adapter, product, table } = setup();
    expect(ctx.getSegregatedWrites()![collection]).toEqual(auditFields);
    const prepared = adapter.prepare(product, ctx);
    expect(prepared.segregated![collection][product.productCode]).toMatchObject({
      inventedName: "Updated product", nameMedicinalProduct: "Medicinal product",
      createdBy: "creator", updatedBy: "updater", version: 2,
    });
    ctx.put("segregatedData", prepared.segregated);
    await adapter.update(OtherProductShared, prepared.id, prepared.record, ctx);
    stub.commit();
    const key = stub.createCompositeKey(table, [product.productCode]);
    const stored = JSON.parse(Buffer.from(await stub.getPrivateData(collection, key)).toString());
    expect(stored).toMatchObject({ inventedName: "Updated product", nameMedicinalProduct: "Medicinal product", createdBy: "creator", updatedBy: "updater", version: 2 });
    expect(stored).not.toHaveProperty("userGroup");
    ctx.readFrom(collection);
    ctx.markFullySegregated();
    const read = await adapter.read(OtherProductShared, product.productCode, ctx);
    expect(read).toMatchObject(stored);
  });

  it("retains the full mirror payload under the same nested Audit state", () => {
    const { ctx, adapter, product } = setup();
    ctx.put("mirror", true);
    ctx.put("mirrorCollection", "mirror-collection");
    const prepared = adapter.prepare(product, ctx);
    expect(prepared.segregated).toBeUndefined();
    expect(prepared.record).toMatchObject({ inventedName: "Updated product", nameMedicinalProduct: "Medicinal product", createdBy: "creator", updatedBy: "updater", version: 2 });
  });

  it("does not mutate inherited field arrays when a child registers writes", () => {
    const { ctx, table } = setup();
    const parentPlan = (ctx.getSegregatedWrites as any)(table);
    const before = [...parentPlan[collection]];
    const child = new FabricContractContext(ctx);
    (child.writeTo as any)(collection, ["childOnly"], table);
    expect(parentPlan[collection]).toEqual(before);
    expect((child.getSegregatedWrites as any)(table)[collection]).toContain("childOnly");
  });
});
