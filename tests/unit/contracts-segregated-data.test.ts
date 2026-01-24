import "reflect-metadata";

import {
  Model,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { pk, table, column } from "@decaf-ts/core";
import { prop, uses } from "@decaf-ts/decoration";
import { FabricContractAdapter } from "../../src/contracts/ContractAdapter";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import { FabricContractRepository } from "../../src/contracts/FabricContractRepository";
import { getStubMock, getIdentityMock } from "./ContextMock";
import { FabricFlavour } from "../../src/shared/constants";
import {
  sharedData,
  privateData,
  ownedBy,
  segregatedDataOnCreate,
  segregatedDataOnRead,
  SegregatedDataMetadata,
} from "../../src/shared/decorators";

jest.setTimeout(50000);

const COLLECTION_A = "collectionA";
const COLLECTION_B = "collectionB";

/**
 * Test model WITHOUT segregated data for baseline comparison
 */
@uses(FabricFlavour)
@table("public_test")
@model()
class PublicTestModel extends Model {
  @pk()
  id!: string;

  @column()
  @required()
  publicField!: string;

  constructor(args?: ModelArg<PublicTestModel>) {
    super(args);
  }
}

/**
 * Test model WITH @sharedData decorator for segregated data testing
 */
@uses(FabricFlavour)
@table("shared_test")
@model()
class SharedDataTestModel extends Model {
  @pk()
  id!: string;

  @column()
  @required()
  publicField!: string;

  @sharedData(COLLECTION_A)
  privateField?: string;

  @ownedBy()
  owner?: string;

  constructor(args?: ModelArg<SharedDataTestModel>) {
    super(args);
  }
}

/**
 * Test model with @privateData decorator
 */
@uses(FabricFlavour)
@table("private_test")
@model()
class PrivateDataTestModel extends Model {
  @pk()
  id!: string;

  @column()
  @required()
  publicField!: string;

  @privateData(COLLECTION_B)
  secretField?: string;

  @ownedBy()
  owner?: string;

  constructor(args?: ModelArg<PrivateDataTestModel>) {
    super(args);
  }
}

/**
 * Helper to create a FabricContractContext with MockStub
 * Note: The adapter expects "segregated" key to exist in context (even if undefined)
 * to avoid "key does not exist" errors from the accumulator.
 */
function createMockContext() {
  const stub = getStubMock();
  const identity = getIdentityMock();
  const context = new FabricContractContext();
  context.accumulate({
    stub: stub as any,
    identity: identity as any,
    logger: {
      for: jest.fn().mockReturnThis(),
      clear: jest.fn().mockReturnThis(),
      info: jest.fn(),
      error: jest.fn(),
      verbose: jest.fn(),
      debug: jest.fn(),
      silly: jest.fn(),
      warn: jest.fn(),
    } as any,
    timestamp: new Date(),
    // The adapter checks ctx.get("segregated") which throws if key doesn't exist
    // Set to undefined for public data, or a collection name for private data
    segregated: undefined,
  });
  return { context, stub };
}

describe("MockStub Private Data Operations", () => {
  it("supports basic private data operations (put/get/delete)", async () => {
    const { stub } = createMockContext();

    // Put private data
    const testData = Buffer.from(JSON.stringify({ name: "test" }));
    await stub.putPrivateData(COLLECTION_A, "key1", testData);

    // Get private data
    const result = await stub.getPrivateData(COLLECTION_A, "key1");
    expect(result).toBeDefined();
    expect(Buffer.from(result).toString()).toContain("test");

    // Delete private data
    await stub.deletePrivateData(COLLECTION_A, "key1");

    // Verify deletion
    const deleted = await stub.getPrivateData(COLLECTION_A, "key1");
    expect(deleted).toBe("");
  });

  it("getPrivateDataQueryResult filters by selector", async () => {
    const { stub } = createMockContext();

    // Insert multiple records
    for (let i = 1; i <= 5; i++) {
      const data = Buffer.from(
        JSON.stringify({
          $$table: "test_table",
          name: `item${i}`,
          value: i * 10,
        })
      );
      await stub.putPrivateData(COLLECTION_A, `key${i}`, data);
    }

    // Query with selector
    const query = JSON.stringify({
      selector: {
        $$table: "test_table",
        value: { $gt: 20 },
      },
    });

    const iterator = await stub.getPrivateDataQueryResult(COLLECTION_A, query);
    const results: any[] = [];
    let res = await iterator.next();
    while (!res.done) {
      if (res.value) {
        results.push(JSON.parse(Buffer.from(res.value.value).toString()));
      }
      res = await iterator.next();
    }

    // Should return items with value > 20 (items 3, 4, 5)
    expect(results.length).toBe(3);
    expect(results.every((r) => r.value > 20)).toBe(true);
  });

  it("simulates pagination for private data using _id > bookmark pattern", async () => {
    const { stub } = createMockContext();

    // Insert records
    for (let i = 1; i <= 10; i++) {
      const key = `record_${String(i).padStart(3, "0")}`;
      const data = Buffer.from(
        JSON.stringify({
          $$table: "pagination_test",
          name: `item${i}`,
          _id: key,
        })
      );
      await stub.putPrivateData(COLLECTION_A, key, data);
    }

    // First page - no bookmark
    const query1 = JSON.stringify({
      selector: { $$table: "pagination_test" },
    });
    const it1 = await stub.getPrivateDataQueryResult(COLLECTION_A, query1);
    const page1: any[] = [];
    let lastKey1 = "";
    let count = 0;
    let res = await it1.next();
    while (!res.done && count < 3) {
      if (res.value) {
        page1.push(JSON.parse(Buffer.from(res.value.value).toString()));
        lastKey1 = res.value.key;
        count++;
      }
      res = await it1.next();
    }
    await it1.close();

    expect(page1.length).toBe(3);
    expect(lastKey1).toBe("record_003");

    // Second page - use bookmark simulation with _id > lastKey
    const query2 = JSON.stringify({
      selector: {
        $$table: "pagination_test",
        _id: { $gt: lastKey1 },
      },
    });
    const it2 = await stub.getPrivateDataQueryResult(COLLECTION_A, query2);
    const page2: any[] = [];
    count = 0;
    res = await it2.next();
    while (!res.done && count < 3) {
      if (res.value) {
        page2.push(JSON.parse(Buffer.from(res.value.value).toString()));
        count++;
      }
      res = await it2.next();
    }
    await it2.close();

    expect(page2.length).toBe(3);
    // Page 2 should start after record_003
    expect(page2[0].name).toBe("item4");
  });
});

describe("FabricContractContext segregation methods", () => {
  it("writeTo accumulates collections and records for segregateWrite", () => {
    const { context } = createMockContext();

    context.writeTo(COLLECTION_A, { id: "1", data: "test1" });
    context.writeTo(COLLECTION_A, { id: "2", data: "test2" });
    context.writeTo(COLLECTION_B, { id: "3", data: "test3" });

    const writes = context.getOrUndefined("segregateWrite") as Record<
      string,
      any[]
    >;

    expect(writes).toBeDefined();
    expect(writes[COLLECTION_A]).toHaveLength(2);
    expect(writes[COLLECTION_B]).toHaveLength(1);
    expect(writes[COLLECTION_A][0]).toEqual({ id: "1", data: "test1" });
  });

  it("readFrom accumulates unique collections for segregateRead", () => {
    const { context } = createMockContext();

    context.readFrom(COLLECTION_A);
    context.readFrom(COLLECTION_B);
    context.readFrom(COLLECTION_A); // duplicate should be ignored

    const reads = context.getOrUndefined("segregateRead") as string[];

    expect(reads).toBeDefined();
    expect(reads).toHaveLength(2);
    expect(reads).toContain(COLLECTION_A);
    expect(reads).toContain(COLLECTION_B);
  });

  it("readFrom accepts array of collections", () => {
    const { context } = createMockContext();

    context.readFrom([COLLECTION_A, COLLECTION_B]);

    const reads = context.getOrUndefined("segregateRead") as string[];

    expect(reads).toBeDefined();
    expect(reads).toHaveLength(2);
  });
});

describe("Segregated Data Decorator Handlers", () => {
  /**
   * These tests verify the decorator handler functions directly
   * to ensure they properly extract metadata and set context
   */

  describe("segregatedDataOnCreate handler", () => {
    it("calls context.writeTo with the collection and segregated model", async () => {
      const { context } = createMockContext();
      const adapter = new FabricContractAdapter(
        undefined as any,
        `handler-test-${Math.random()}`
      );
      const repository = new FabricContractRepository<SharedDataTestModel>(
        adapter,
        SharedDataTestModel
      );

      const model = new SharedDataTestModel({
        id: "handler-1",
        publicField: "public",
        privateField: "secret",
        owner: "Aeon", // MSP ID from mock identity
      });

      const data: SegregatedDataMetadata[] = [{ collections: COLLECTION_A }];
      const keys: (keyof SharedDataTestModel)[] = ["privateField"];

      await segregatedDataOnCreate.call(
        repository,
        context,
        data,
        keys,
        model
      );

      const writes = context.getOrUndefined("segregateWrite") as Record<
        string,
        any[]
      >;

      expect(writes).toBeDefined();
      expect(writes[COLLECTION_A]).toBeDefined();
      expect(writes[COLLECTION_A].length).toBeGreaterThan(0);
    });

    it("extracts MSP from identity if model has no owner", async () => {
      const { context } = createMockContext();
      const adapter = new FabricContractAdapter(
        undefined as any,
        `handler-test-${Math.random()}`
      );
      const repository = new FabricContractRepository<SharedDataTestModel>(
        adapter,
        SharedDataTestModel
      );

      const model = new SharedDataTestModel({
        id: "handler-2",
        publicField: "public",
        privateField: "secret",
        // No owner - should extract from identity
      });

      const data: SegregatedDataMetadata[] = [{ collections: COLLECTION_A }];
      const keys: (keyof SharedDataTestModel)[] = ["privateField"];

      await segregatedDataOnCreate.call(
        repository,
        context,
        data,
        keys,
        model
      );

      const writes = context.getOrUndefined("segregateWrite") as Record<
        string,
        any[]
      >;
      expect(writes).toBeDefined();
      expect(writes[COLLECTION_A]).toBeDefined();
    });
  });

  describe("segregatedDataOnRead handler", () => {
    it("calls context.readFrom with the collection", async () => {
      const { context } = createMockContext();
      const adapter = new FabricContractAdapter(
        undefined as any,
        `handler-test-${Math.random()}`
      );
      const repository = new FabricContractRepository<SharedDataTestModel>(
        adapter,
        SharedDataTestModel
      );

      const model = new SharedDataTestModel({
        id: "handler-3",
        publicField: "public",
        privateField: "secret",
        owner: "Aeon",
      });

      const data: SegregatedDataMetadata[] = [{ collections: COLLECTION_A }];
      const keys: (keyof SharedDataTestModel)[] = ["privateField"];

      await segregatedDataOnRead.call(repository, context, data, keys, model);

      const reads = context.getOrUndefined("segregateRead") as string[];

      expect(reads).toBeDefined();
      expect(reads).toContain(COLLECTION_A);
    });
  });
});

describe("FabricContractAdapter forPrivate pattern", () => {
  /**
   * The forPrivate() proxy pattern is the recommended way to
   * route adapter operations to private data collections.
   *
   * Note: Full proxy testing requires integration tests with proper
   * Fabric stub setup. Unit tests here verify the proxy is created.
   */

  let adapter: FabricContractAdapter;

  beforeEach(() => {
    adapter = new FabricContractAdapter(
      undefined as any,
      `private-test-${Math.random()}`
    );
  });

  it("forPrivate returns a proxy adapter", () => {
    const privateAdapter = adapter.forPrivate(COLLECTION_A);
    expect(privateAdapter).toBeDefined();
    expect(privateAdapter).not.toBe(adapter);
  });

  it("forPrivate proxy routes putState to putPrivateData", async () => {
    const { context, stub } = createMockContext();
    const privateAdapter = adapter.forPrivate(COLLECTION_A);

    await privateAdapter.create(
      PublicTestModel,
      "priv-1",
      { $$table: "public_test", publicField: "private-data" },
      context
    );

    // Verify data was written to private collection
    const privateData = await stub.getPrivateData(
      COLLECTION_A,
      "public_test_priv-1"
    );
    expect(privateData).toBeDefined();
    expect(Buffer.from(privateData).toString()).toContain("private-data");
  });

  it("forPrivate proxy routes readState to getPrivateData", async () => {
    const { context, stub } = createMockContext();

    // First write data to private collection
    const testData = Buffer.from(
      JSON.stringify({ $$table: "public_test", publicField: "secret" })
    );
    await stub.putPrivateData(COLLECTION_A, "public_test_priv-2", testData);

    const privateAdapter = adapter.forPrivate(COLLECTION_A);
    const result = await privateAdapter.read(PublicTestModel, "priv-2", context);

    expect(result).toBeDefined();
    expect(result.publicField).toBe("secret");
  });

  it("forPrivate proxy routes deleteState to deletePrivateData", async () => {
    const { context, stub } = createMockContext();

    // First create private data
    const testData = Buffer.from(
      JSON.stringify({ $$table: "public_test", publicField: "to-delete" })
    );
    await stub.putPrivateData(COLLECTION_A, "public_test_priv-3", testData);

    const privateAdapter = adapter.forPrivate(COLLECTION_A);
    await privateAdapter.delete(PublicTestModel, "priv-3", context);

    // Verify deletion
    const result = await stub.getPrivateData(
      COLLECTION_A,
      "public_test_priv-3"
    );
    expect(result).toBe("");
  });

  it("forPrivate proxy routes queryResult to getPrivateDataQueryResult", async () => {
    const { context, stub } = createMockContext();

    // Insert private data
    for (let i = 1; i <= 3; i++) {
      const data = Buffer.from(
        JSON.stringify({
          $$table: "public_test",
          publicField: `item-${i}`,
        })
      );
      await stub.putPrivateData(COLLECTION_A, `public_test_pq${i}`, data);
    }

    const privateAdapter = adapter.forPrivate(COLLECTION_A);
    const query = { selector: { $$table: "public_test" } };
    const results = await privateAdapter.raw(query, true, context);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(3);
  });
});

describe("Public data flow (baseline verification)", () => {
  /**
   * Verify that public data operations work correctly
   * to ensure we haven't broken the stable public flow
   */

  let adapter: FabricContractAdapter;

  beforeEach(() => {
    adapter = new FabricContractAdapter(
      undefined as any,
      `public-test-${Math.random()}`
    );
  });

  it("creates public data in world state", async () => {
    const { context, stub } = createMockContext();

    await adapter.create(
      PublicTestModel,
      "pub-1",
      { $$table: "public_test", publicField: "public-data" },
      context
    );

    const publicData = await stub.getState("public_test_pub-1");
    expect(publicData).toBeDefined();
    expect(Buffer.from(publicData).toString()).toContain("public-data");
  });

  it("reads public data from world state", async () => {
    const { context, stub } = createMockContext();

    const testData = Buffer.from(
      JSON.stringify({ $$table: "public_test", publicField: "world-state" })
    );
    await stub.putState("public_test_pub-2", testData);

    const result = await adapter.read(PublicTestModel, "pub-2", context);

    expect(result).toBeDefined();
    expect(result.publicField).toBe("world-state");
  });

  it("queries public data from world state", async () => {
    const { context, stub } = createMockContext();

    for (let i = 1; i <= 3; i++) {
      const data = Buffer.from(
        JSON.stringify({
          $$table: "public_test",
          publicField: `public-${i}`,
        })
      );
      await stub.putState(`public_test_pubq${i}`, data);
    }

    const query = { selector: { $$table: "public_test" } };
    const results = await adapter.raw(query, true, context);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(3);
  });

  it("paginates public data using native pagination", async () => {
    const { context, stub } = createMockContext();

    for (let i = 1; i <= 10; i++) {
      const key = `public_test_ppg${String(i).padStart(2, "0")}`;
      const data = Buffer.from(
        JSON.stringify({
          $$table: "public_test",
          publicField: `item-${i}`,
        })
      );
      await stub.putState(key, data);
    }

    const query = { selector: { $$table: "public_test" }, limit: 3 };
    const result = await adapter.raw(query, false, context);

    expect(result.docs).toBeDefined();
    expect(result.docs.length).toBeLessThanOrEqual(3);
    expect(result.bookmark).toBeDefined();
  });
});

describe("Integration: Decorator metadata extraction", () => {
  /**
   * These tests verify that the @sharedData and @privateData decorators
   * properly set up metadata on the model classes
   */

  it("@sharedData decorator sets up transient property metadata", () => {
    const model = new SharedDataTestModel({
      id: "meta-1",
      publicField: "public",
      privateField: "secret",
    });

    // The @sharedData decorator should mark privateField as transient
    const segregated = Model.segregate(model);

    expect(segregated.model).toBeDefined();
    expect(segregated.transient).toBeDefined();
    // privateField should be in transient since it's segregated
    expect(segregated.transient?.privateField).toBe("secret");
  });

  it("@privateData decorator sets up transient property metadata", () => {
    const model = new PrivateDataTestModel({
      id: "meta-2",
      publicField: "public",
      secretField: "very-secret",
    });

    const segregated = Model.segregate(model);

    expect(segregated.model).toBeDefined();
    expect(segregated.transient).toBeDefined();
    // secretField should be in transient since it's private
    expect(segregated.transient?.secretField).toBe("very-secret");
  });

  it("public fields remain in model after segregation", () => {
    const model = new SharedDataTestModel({
      id: "meta-3",
      publicField: "public",
      privateField: "secret",
    });

    const segregated = Model.segregate(model);

    // id and publicField should remain in model
    expect(segregated.model.id).toBe("meta-3");
    expect(segregated.model.publicField).toBe("public");
    // privateField should not be in model
    expect(segregated.model.privateField).toBeUndefined();
  });
});
