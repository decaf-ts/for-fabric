import "reflect-metadata";

import { Model, model, type ModelArg } from "@decaf-ts/decorator-validation";
import { pk, table } from "@decaf-ts/core";
import { prop } from "@decaf-ts/decoration";
import { FabricContractAdapter } from "../../src/contracts/ContractAdapter";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import { getStubMock, getIdentityMock } from "./ContextMock";

// ---- test model ----

@table("rl_item")
@model()
class RangeListItem extends Model {
  @pk()
  id!: string;

  @prop()
  label?: string;

  @prop()
  category?: string;

  constructor(args?: ModelArg<RangeListItem>) {
    super(args);
  }
}

// ---- helpers ----

function buildAdapter(): FabricContractAdapter {
  return new FabricContractAdapter(
    undefined as any,
    `range-list-test-${Math.random().toString(36).slice(2)}`
  );
}

function buildCtx(stub: ReturnType<typeof getStubMock>): FabricContractContext {
  const ctx = new FabricContractContext();
  ctx.put("stub", stub as any);
  ctx.put("identity", getIdentityMock() as any);
  return ctx;
}

/** Serializes a plain object the same way putState does (no anchor). */
function serialize(data: Record<string, any>): Buffer {
  return Buffer.from(JSON.stringify(data), "utf8");
}

// ---- tests ----

describe("FabricContractAdapter.rangeList", () => {
  const TABLE = "rl_item";

  it("returns empty array when no entries exist", async () => {
    const stub = getStubMock();
    const ctx = buildCtx(stub);
    const adapter = buildAdapter();

    const results = await adapter.rangeList(RangeListItem, [], ctx);
    expect(results).toEqual([]);
  });

  it("returns all public entries when attributes=[]", async () => {
    const stub = getStubMock();
    const ctx = buildCtx(stub);
    const adapter = buildAdapter();

    const entries = [
      { id: "aaa", label: "Alpha", category: "cat1" },
      { id: "bbb", label: "Bravo", category: "cat2" },
    ];

    for (const e of entries) {
      const key = stub.createCompositeKey(TABLE, [e.id]);
      await stub.putState(key, serialize({ label: e.label, category: e.category }));
    }
    stub.commit();

    const results = await adapter.rangeList(RangeListItem, [], ctx);
    expect(results).toHaveLength(2);
    const ids = results.map((r) => r.id).sort();
    expect(ids).toEqual(["aaa", "bbb"]);
  });

  it("returns only matching entry when partial attribute filter applied", async () => {
    const stub = getStubMock();
    const ctx = buildCtx(stub);
    const adapter = buildAdapter();

    const entries = [
      { id: "x1", label: "X-one" },
      { id: "x2", label: "X-two" },
      { id: "y1", label: "Y-one" },
    ];

    for (const e of entries) {
      const key = stub.createCompositeKey(TABLE, [e.id]);
      await stub.putState(key, serialize({ label: e.label }));
    }
    stub.commit();

    // Partial filter on first attribute component "x1" — only the exact entry
    const results = await adapter.rangeList(RangeListItem, ["x1"], ctx);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("x1");
  });

  it("skips public state when context is fully segregated", async () => {
    const stub = getStubMock();
    const ctx = buildCtx(stub);
    ctx.markFullySegregated();
    const adapter = buildAdapter();

    // Put something in public state — should be ignored
    const pubKey = stub.createCompositeKey(TABLE, ["pub1"]);
    await stub.putState(pubKey, serialize({ label: "public" }));
    stub.commit();

    const results = await adapter.rangeList(RangeListItem, [], ctx);
    expect(results).toEqual([]);
  });

  it("reads from private collection when fully segregated and readFrom set", async () => {
    const stub = getStubMock();
    const COLLECTION = "test-private-col";
    const ctx = buildCtx(stub);
    ctx.markFullySegregated();
    ctx.readFrom(COLLECTION);
    const adapter = buildAdapter();

    const key = stub.createCompositeKey(TABLE, ["priv1"]);
    await stub.putPrivateData(COLLECTION, key, serialize({ label: "private-alpha" }) as any);
    stub.commit();

    const results = await adapter.rangeList(RangeListItem, [], ctx);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("priv1");
    expect(results[0].label).toBe("private-alpha");
  });

  it("merges public and private data for the same composite key", async () => {
    const stub = getStubMock();
    const COLLECTION = "test-merge-col";
    const ctx = buildCtx(stub);
    ctx.readFrom(COLLECTION);
    const adapter = buildAdapter();

    const key = stub.createCompositeKey(TABLE, ["merge1"]);

    // Public: has label only
    await stub.putState(key, serialize({ label: "from-public" }));
    // Private: has category only
    await stub.putPrivateData(COLLECTION, key, serialize({ category: "from-private" }) as any);
    stub.commit();

    const results = await adapter.rangeList(RangeListItem, [], ctx);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("merge1");
    expect(results[0].label).toBe("from-public");
    expect(results[0].category).toBe("from-private");
  });

  it("private data overwrites public data for the same key when both define the same field", async () => {
    const stub = getStubMock();
    const COLLECTION = "test-overwrite-col";
    const ctx = buildCtx(stub);
    ctx.readFrom(COLLECTION);
    const adapter = buildAdapter();

    const key = stub.createCompositeKey(TABLE, ["ow1"]);

    await stub.putState(key, serialize({ label: "public-value" }));
    await stub.putPrivateData(COLLECTION, key, serialize({ label: "private-value" }) as any);
    stub.commit();

    const results = await adapter.rangeList(RangeListItem, [], ctx);
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe("private-value");
  });

  it("filters private collection entries by partial attribute", async () => {
    const stub = getStubMock();
    const COLLECTION = "test-filter-col";
    const ctx = buildCtx(stub);
    ctx.markFullySegregated();
    ctx.readFrom(COLLECTION);
    const adapter = buildAdapter();

    const entries = [
      { id: "fa1", label: "FA-one" },
      { id: "fa2", label: "FA-two" },
      { id: "fb1", label: "FB-one" },
    ];

    for (const e of entries) {
      const key = stub.createCompositeKey(TABLE, [e.id]);
      await stub.putPrivateData(COLLECTION, key, serialize({ label: e.label }) as any);
    }
    stub.commit();

    const results = await adapter.rangeList(RangeListItem, ["fa2"], ctx);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("fa2");
    expect(results[0].label).toBe("FA-two");
  });

  it("reads from multiple private collections and deduplicates by composite key", async () => {
    const stub = getStubMock();
    const COL_A = "multi-col-a";
    const COL_B = "multi-col-b";
    const ctx = buildCtx(stub);
    ctx.markFullySegregated();
    ctx.readFrom([COL_A, COL_B]);
    const adapter = buildAdapter();

    const keyShared = stub.createCompositeKey(TABLE, ["shared1"]);
    const keyOnlyA = stub.createCompositeKey(TABLE, ["only-a"]);
    const keyOnlyB = stub.createCompositeKey(TABLE, ["only-b"]);

    await stub.putPrivateData(COL_A, keyShared, serialize({ label: "shared-from-a" }) as any);
    await stub.putPrivateData(COL_B, keyShared, serialize({ category: "shared-from-b" }) as any);
    await stub.putPrivateData(COL_A, keyOnlyA, serialize({ label: "only-a" }) as any);
    await stub.putPrivateData(COL_B, keyOnlyB, serialize({ label: "only-b" }) as any);
    stub.commit();

    const results = await adapter.rangeList(RangeListItem, [], ctx);
    expect(results).toHaveLength(3);
    const shared = results.find((r) => r.id === "shared1");
    expect(shared?.label).toBe("shared-from-a");
    expect(shared?.category).toBe("shared-from-b");
    expect(results.find((r) => r.id === "only-a")?.label).toBe("only-a");
    expect(results.find((r) => r.id === "only-b")?.label).toBe("only-b");
  });
});
