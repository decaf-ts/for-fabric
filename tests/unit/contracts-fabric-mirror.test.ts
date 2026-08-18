import "reflect-metadata";

import { Model, model } from "@decaf-ts/decorator-validation";
import { pk } from "@decaf-ts/core";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import { FabricContractAdapter } from "../../src/contracts/ContractAdapter";
import type { FabricContractRepository } from "../../src/contracts/FabricContractRepository";
import {
  createMirrorHandler,
  deleteMirrorHandler,
  mirrorWriteGuard,
  mirror,
  readMirrorHandler,
  updateMirrorHandler,
  applyMirrorFlags,
  MirrorMetadata,
} from "../../src/shared/decorators";
import { ChaincodeStub } from "fabric-shim-api";

@model()
class MirrorTestModel extends Model {
  @pk()
  id!: string;

  constructor() {
    super();
  }
}

@model()
@mirror("mirror-collection", "main-org")
class MirroredRouteModel extends Model {
  @pk()
  id!: string;

  constructor() {
    super();
  }
}

@model()
@mirror("mirror-collection", "main-org", undefined, () => false)
class BlockedMirroredRouteModel extends Model {
  @pk()
  id!: string;

  constructor() {
    super();
  }
}

type LoggerSpy = ReturnType<typeof createLogger>;

function createLogger() {
  return {
    info: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    silly: jest.fn(),
    for: jest.fn().mockReturnThis(),
  };
}

function flattenArgs(value: any): any[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value))
    return value.reduce(
      (acc: any[], item) => acc.concat(flattenArgs(item)),
      []
    );
  return [value];
}

function decodePrivateBookmark(bookmark: string) {
  const prefix = "__dcf_pvtbm__";
  if (!bookmark.startsWith(prefix)) return undefined;
  return JSON.parse(
    Buffer.from(bookmark.slice(prefix.length), "base64url").toString("utf8")
  );
}

function enableContextPut(ctx: FabricContractContext) {
  (ctx as any).put = (key: string, value: any) =>
    ctx.accumulate({ [key]: value });
}

class SpyAdapter extends FabricContractAdapter {
  private readonly fakeLog: LoggerSpy = createLogger();

  constructor() {
    super(
      undefined as any,
      `mirror-test-${Math.random().toString(36).slice(2)}`
    );
  }

  public callForPrivate(collection: string) {
    return this.forPrivate(collection);
  }

  protected override logCtx(...args: any[]): any {
    const ctx = flattenArgs(args).find(
      (candidate) => candidate instanceof FabricContractContext
    ) as FabricContractContext | undefined;
    if (!ctx) throw new Error("Missing context");

    return {
      log: this.fakeLog,
      ctx,
      ctxArgs: [ctx],
      stub: ctx.stub,
      identity: ctx.identity,
    };
  }
}

describe("mirror decorator handlers", () => {
  const mirrorMetadata: MirrorMetadata = {
    resolver: "mirror-collection",
    condition: (msp) => msp === "main-org",
  };

  const blockedMirrorMetadata: MirrorMetadata = {
    resolver: "mirror-collection",
    condition: (msp) => msp === "main-org",
    allow: () => false,
  };

  const allowedMirrorMetadata: MirrorMetadata = {
    resolver: "mirror-collection",
    condition: (msp) => msp === "main-org",
    allow: () => true,
  };

  const logger = createLogger();

  it("creates mirror via repo.override with mirror flags", async () => {
    const createSpy = jest.fn().mockResolvedValue(new MirrorTestModel({ id: "mirror-id" }));
    const overrideSpy = jest.fn().mockReturnValue({ create: createSpy });

    const repository = {
      _overrides: {},
      override: overrideSpy,
      class: MirrorTestModel,
    } as unknown as FabricContractRepository<MirrorTestModel>;

    const context = new FabricContractContext();
    context.accumulate({ allowMirroring: true, logger } as any);

    const model = new MirrorTestModel({ id: "mirror-id" });

    await createMirrorHandler.call(
      repository,
      context,
      mirrorMetadata,
      "id",
      model
    );

    expect(overrideSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        mirrorCollection: "mirror-collection",
        mirror: true,
        ignoreValidation: true,
        ignoreHandlers: true,
      })
    );
    expect(createSpy).toHaveBeenCalledWith(model, context);
  });

  it("marks reads as fully segregated and targets the mirror collection when the MSP matches", async () => {
    const context = new FabricContractContext();
    enableContextPut(context);
    const identity = {
      getMSPID: jest.fn().mockReturnValue("main-org"),
    };
    context.accumulate({ allowMirroring: true, identity, logger } as any);

    const model = new MirrorTestModel({ id: "mirror-id" });

    await readMirrorHandler.call(
      {} as FabricContractRepository<MirrorTestModel>,
      context,
      mirrorMetadata,
      "id",
      model
    );

    // Should mark as fully segregated so adapter skips public readState()
    expect(context.isFullySegregated).toBe(true);
    // Should register the mirror collection for reading via forPrivate()
    expect(context.getReadCollections()).toContain("mirror-collection");
  });

  it("leaves reads untouched when the mirror condition does not match", async () => {
    const context = new FabricContractContext();
    enableContextPut(context);
    const identity = {
      getMSPID: jest.fn().mockReturnValue("other-org"),
    };
    context.accumulate({ allowMirroring: true, identity, logger } as any);

    const model = new MirrorTestModel({ id: "mirror-id" });

    await readMirrorHandler.call(
      {} as FabricContractRepository<MirrorTestModel>,
      context,
      {
        resolver: "mirror-collection",
        condition: () => false,
      },
      "id",
      model
    );

    // Should NOT set fullySegregated — normal read flow applies
    expect(context.isFullySegregated).toBe(false);
    // Should NOT register collections — normal public read applies
    expect(context.getReadCollections()).toHaveLength(0);
  });

  it("does not activate mirror routing when allowMirroring is false", async () => {
    const context = new FabricContractContext();
    enableContextPut(context);
    const readFromSpy = jest.spyOn(context, "readFrom");
    context.accumulate({
      allowMirroring: false,
      identity: {
        getMSPID: jest.fn().mockReturnValue("main-org"),
      },
      logger,
    } as any);

    await applyMirrorFlags(MirroredRouteModel, "main-org", context);

    expect(readFromSpy).not.toHaveBeenCalled();
    expect(context.getOrUndefined("mirror")).toBeUndefined();
    expect(context.getOrUndefined("mirrorCollection")).toBeUndefined();
    expect(context.isFullySegregated).toBe(false);
  });

  it("stores the allow predicate on mirror metadata and bypasses mirror routing when it returns false", async () => {
    const context = new FabricContractContext();
    enableContextPut(context);
    const readFromSpy = jest.spyOn(context, "readFrom");
    context.accumulate({
      allowMirroring: true,
      identity: {
        getMSPID: jest.fn().mockReturnValue("main-org"),
      },
      logger,
    } as any);

    const mirrorMeta = Model.mirroredAt(BlockedMirroredRouteModel);
    expect(mirrorMeta?.allow?.(context as any)).toBe(false);

    await applyMirrorFlags(BlockedMirroredRouteModel, "main-org", context);

    expect(readFromSpy).not.toHaveBeenCalled();
    expect(context.getOrUndefined("mirror")).toBeUndefined();
    expect(context.getOrUndefined("mirrorCollection")).toBeUndefined();
    expect(context.isFullySegregated).toBe(false);
  });

  it("does not create mirror copies when allowMirroring is false", async () => {
    const overrideSpy = jest.fn();
    const repository = {
      _overrides: {},
      override: overrideSpy,
      class: MirrorTestModel,
    } as unknown as FabricContractRepository<MirrorTestModel>;
    const context = new FabricContractContext();
    context.accumulate({ allowMirroring: false, logger } as any);

    await createMirrorHandler.call(
      repository,
      context,
      mirrorMetadata,
      "id",
      new MirrorTestModel({ id: "mirror-id" })
    );

    expect(overrideSpy).not.toHaveBeenCalled();
    expect(context.getOrUndefined("mirror")).toBeUndefined();
    expect(context.getOrUndefined("mirrorCollection")).toBeUndefined();
  });

  it("does not create mirror copies when allow(context) returns false", async () => {
    const overrideSpy = jest.fn();
    const repository = {
      _overrides: {},
      override: overrideSpy,
      class: MirrorTestModel,
    } as unknown as FabricContractRepository<MirrorTestModel>;
    const context = new FabricContractContext();
    context.accumulate({ allowMirroring: true, logger } as any);

    await createMirrorHandler.call(
      repository,
      context,
      blockedMirrorMetadata,
      "id",
      new MirrorTestModel({ id: "mirror-id" })
    );

    expect(overrideSpy).not.toHaveBeenCalled();
    expect(context.getOrUndefined("mirror")).toBeUndefined();
    expect(context.getOrUndefined("mirrorCollection")).toBeUndefined();
  });

  it("routes reads when allow(context) returns true", async () => {
    const context = new FabricContractContext();
    enableContextPut(context);
    const readFromSpy = jest.spyOn(context, "readFrom");
    context.accumulate({
      allowMirroring: true,
      identity: {
        getMSPID: jest.fn().mockReturnValue("main-org"),
      },
      logger,
    } as any);

    await readMirrorHandler.call(
      {} as FabricContractRepository<MirrorTestModel>,
      context,
      allowedMirrorMetadata,
      "id",
      new MirrorTestModel({ id: "mirror-id" })
    );

    expect(readFromSpy).toHaveBeenCalledWith("mirror-collection");
    expect(context.isFullySegregated).toBe(true);
    expect(context.getOrUndefined("mirror")).toBe(true);
    expect(context.getOrUndefined("mirrorCollection")).toBe("mirror-collection");
  });

  it("does not update mirror copies when allowMirroring is false", async () => {
    const overrideSpy = jest.fn();
    const repository = {
      _overrides: {},
      override: overrideSpy,
      class: MirrorTestModel,
    } as unknown as FabricContractRepository<MirrorTestModel>;
    const context = new FabricContractContext();
    context.accumulate({ allowMirroring: false, logger } as any);

    await updateMirrorHandler.call(
      repository,
      context,
      mirrorMetadata,
      "id",
      new MirrorTestModel({ id: "mirror-id" })
    );

    expect(overrideSpy).not.toHaveBeenCalled();
    expect(context.getOrUndefined("mirror")).toBeUndefined();
    expect(context.getOrUndefined("mirrorCollection")).toBeUndefined();
  });

  it("does not delete mirror copies when allowMirroring is false", async () => {
    const overrideSpy = jest.fn();
    const repository = {
      _overrides: {},
      override: overrideSpy,
      class: MirrorTestModel,
    } as unknown as FabricContractRepository<MirrorTestModel>;
    const context = new FabricContractContext();
    context.accumulate({ allowMirroring: false, logger } as any);

    await deleteMirrorHandler.call(
      repository,
      context,
      mirrorMetadata,
      "id",
      new MirrorTestModel({ id: "mirror-id" })
    );

    expect(overrideSpy).not.toHaveBeenCalled();
    expect(context.getOrUndefined("mirror")).toBeUndefined();
    expect(context.getOrUndefined("mirrorCollection")).toBeUndefined();
  });

  it("does not reject mirrored writes when allowMirroring is false", async () => {
    const context = new FabricContractContext();
    context.accumulate({
      allowMirroring: false,
      identity: {
        getMSPID: jest.fn().mockReturnValue("main-org"),
      },
      logger,
    } as any);

    await expect(
      mirrorWriteGuard.call(
        {} as FabricContractRepository<MirrorTestModel>,
        context,
        mirrorMetadata,
        "id",
        new MirrorTestModel({ id: "mirror-id" })
      )
    ).resolves.toBeUndefined();
  });

  it("does not reject mirrored writes when allow(context) returns false", async () => {
    const context = new FabricContractContext();
    context.accumulate({
      allowMirroring: true,
      identity: {
        getMSPID: jest.fn().mockReturnValue("main-org"),
      },
      logger,
    } as any);

    await expect(
      mirrorWriteGuard.call(
        {} as FabricContractRepository<MirrorTestModel>,
        context,
        blockedMirrorMetadata,
        "id",
        new MirrorTestModel({ id: "mirror-id" })
      )
    ).resolves.toBeUndefined();
  });

  it("does not enforce mirror authorization when allowMirroring is false", () => {
    const adapter = new SpyAdapter();
    const context = new FabricContractContext();
    context.accumulate({
      allowMirroring: false,
      identity: {
        getMSPID: jest.fn().mockReturnValue("main-org"),
      },
      logger,
    } as any);

    expect(() =>
      (adapter as any).enforceMirrorAuthorization(MirrorTestModel, context)
    ).not.toThrow();
  });
});

describe("FabricContractAdapter forPrivate routing", () => {
  let adapter: SpyAdapter;
  let ctx: FabricContractContext;
  let stub: Partial<ChaincodeStub> & ChaincodeStub;

  beforeEach(() => {
    adapter = new SpyAdapter();

    const iterator = {
      next: jest.fn().mockResolvedValue({ done: true }),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    stub = {
      putPrivateData: jest.fn().mockResolvedValue(undefined),
      deletePrivateData: jest.fn().mockResolvedValue(undefined),
      putState: jest.fn().mockResolvedValue(undefined),
      getPrivateData: jest
        .fn()
        .mockResolvedValue(Buffer.from(JSON.stringify({ foo: "bar" }))),
      getState: jest
        .fn()
        .mockResolvedValue(Buffer.from(JSON.stringify({ foo: "bar" }))),
      getPrivateDataQueryResult: jest.fn().mockResolvedValue(iterator),
      getQueryResult: jest.fn(),
      getQueryResultWithPagination: jest.fn(),
      getTxID: jest.fn().mockReturnValue("tx-1"),
    } as unknown as Partial<ChaincodeStub> & ChaincodeStub;

    const identity = {
      getIDBytes: jest.fn().mockReturnValue(Buffer.from("id")),
      getAttributeValue: jest.fn().mockReturnValue(undefined),
      getID: jest.fn().mockReturnValue("client"),
      getMSPID: jest.fn().mockReturnValue("mirror-org"),
    } as any;

    ctx = new FabricContractContext();
    ctx.accumulate({ stub, identity, logger: createLogger() } as any);
  });

  it("forPrivate proxy routes putState to putPrivateData", async () => {
    const proxy = adapter.callForPrivate("mirror-collection");
    await (proxy as any).putState("pk", { foo: "bar" }, ctx);

    expect(stub.putPrivateData).toHaveBeenCalledWith(
      "mirror-collection",
      "pk",
      expect.any(Buffer)
    );
    expect(stub.putState).not.toHaveBeenCalled();
  });

  it("forPrivate proxy routes readState to getPrivateData", async () => {
    const proxy = adapter.callForPrivate("mirror-collection");
    await (proxy as any).readState("pk", ctx);

    expect(stub.getPrivateData).toHaveBeenCalledWith("mirror-collection", "pk");
    expect(stub.getState).not.toHaveBeenCalled();
  });

  it("forPrivate proxy routes queryResult to getPrivateDataQueryResult", async () => {
    const proxy = adapter.callForPrivate("mirror-collection");
    const query = { selector: { foo: "bar" } };
    await (proxy as any).queryResult(stub, query, ctx);

    expect(stub.getPrivateDataQueryResult).toHaveBeenCalledWith(
      "mirror-collection",
      JSON.stringify(query)
    );
    expect(stub.getQueryResult).not.toHaveBeenCalled();
  });

  it("forPrivate proxy routes queryResultPaginated to getPrivateDataQueryResult", async () => {
    const proxy = adapter.callForPrivate("mirror-collection");
    const query = { selector: { foo: "bar" }, sort: [{ foo: "asc" }] };
    await (proxy as any).queryResultPaginated(
      stub,
      query,
      5,
      undefined,
      undefined,
      ctx
    );

    expect(stub.getPrivateDataQueryResult).toHaveBeenCalled();
    expect(stub.getQueryResultWithPagination).not.toHaveBeenCalled();
  });

  it("forPrivate paginated query rejects opaque bookmarks", async () => {
    const proxy = adapter.callForPrivate("mirror-collection");
    await expect(
      (proxy as any).queryResultPaginated(
        stub,
        { selector: { foo: { $gte: "" } }, sort: [{ foo: "asc" }] },
        2,
        undefined,
        "opaque-next-token",
        ctx
      )
    ).rejects.toThrow(
      "Private Mango pagination only supports adapter-generated synthetic bookmarks"
    );

    expect(stub.getPrivateDataQueryResult).not.toHaveBeenCalled();
  });

  it("forPrivate paginated query rejects skip pagination", async () => {
    const proxy = adapter.callForPrivate("mirror-collection");

    await expect(
      (proxy as any).queryResultPaginated(
        stub,
        { selector: { foo: "bar" }, sort: [{ foo: "asc" }] },
        2,
        1,
        undefined,
        ctx
      )
    ).rejects.toThrow(
      "Private Mango pagination does not support skip/offset pagination. Use the returned synthetic bookmark instead."
    );

    expect(stub.getPrivateDataQueryResult).not.toHaveBeenCalled();
  });

  it("forPrivate paginated query requires an explicit sort", async () => {
    const proxy = adapter.callForPrivate("mirror-collection");

    await expect(
      (proxy as any).queryResultPaginated(
        stub,
        { selector: { foo: "bar" } },
        2,
        undefined,
        undefined,
        ctx
      )
    ).rejects.toThrow(
      "Private Mango pagination requires an explicit sort. Add orderBy(...) so a stable generated index can be selected."
    );
  });

  it("forPrivate paginated query appends id as a tie-breaker", async () => {
    const proxy = adapter.callForPrivate("mirror-collection");
    const iterator = {
      next: jest.fn().mockResolvedValue({ done: true }),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;
    (stub.getPrivateDataQueryResult as jest.Mock).mockResolvedValue({
      iterator,
    });

    await (proxy as any).queryResultPaginated(
      stub,
      { selector: { foo: "bar" }, sort: [{ foo: "asc" }] },
      2,
      undefined,
      undefined,
      ctx
    );

    const calledQuery = JSON.parse(
      (stub.getPrivateDataQueryResult as jest.Mock).mock.calls[0][1]
    );
    expect(calledQuery.sort).toEqual([{ foo: "asc" }, { id: "asc" }]);
  });

  it("forPrivate paginated query synthesizes bookmark when more results exist", async () => {
    const proxy = adapter.callForPrivate("mirror-collection");
    const iterator = {
      next: jest
        .fn()
        .mockResolvedValueOnce({
          value: {
            key: "k1",
            value: Buffer.from(
              JSON.stringify({ id: "k1", foo: "bar", ts: 100 })
            ),
          },
          done: false,
        })
        .mockResolvedValueOnce({
          value: {
            key: "k2",
            value: Buffer.from(
              JSON.stringify({ id: "k2", foo: "bar", ts: 101 })
            ),
          },
          done: false,
        })
        .mockResolvedValue({ done: true }),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;
    (stub.getPrivateDataQueryResult as jest.Mock).mockResolvedValue(iterator);

    const response = await (proxy as any).queryResultPaginated(
      stub,
      {
        selector: { foo: "bar" },
        sort: [{ ts: "asc" }],
      },
      1,
      undefined,
      undefined,
      ctx
    );

    const calledQuery = JSON.parse(
      (stub.getPrivateDataQueryResult as jest.Mock).mock.calls[0][1]
    );
    expect(calledQuery).toEqual({
      selector: { foo: "bar" },
      sort: [{ ts: "asc" }, { id: "asc" }],
      limit: 2,
    });

    expect(response.metadata.fetchedRecordsCount).toBe(1);
    expect(response.metadata.bookmark).toBeDefined();
    const first = await response.iterator.next();
    expect(first.value.key).toBe("k1");
  });

  it("forPrivate paginated query rejects a bookmark reused with a different selector", async () => {
    const proxy = adapter.callForPrivate("mirror-collection");
    const bookmark = `__dcf_pvtbm__${Buffer.from(
      JSON.stringify({
        sortField: "ts",
        direction: "asc",
        idField: "id",
        lastValue: 100,
        lastId: "k1",
        queryHash: "hash-1",
      })
    ).toString("base64url")}`;
    (stub.getPrivateDataQueryResult as jest.Mock).mockResolvedValue({
      iterator: {
        next: jest.fn().mockResolvedValue({ done: true }),
        close: jest.fn().mockResolvedValue(undefined),
      },
    });

    await expect(
      (proxy as any).queryResultPaginated(
        stub,
        {
          selector: { foo: "baz" },
          sort: [{ ts: "asc" }],
        },
        1,
        undefined,
        bookmark,
        ctx
      )
    ).rejects.toThrow(
      "Private Mango bookmark does not match the current query"
    );
  });

  it("forPrivate paginated query continues with a synthetic bookmark across duplicate sort values", async () => {
    const proxy = adapter.callForPrivate("mirror-collection");
    const firstIterator = {
      next: jest
        .fn()
        .mockResolvedValueOnce({
          value: {
            key: "k1",
            value: Buffer.from(JSON.stringify({ id: "a", foo: "bar", ts: 1 })),
          },
          done: false,
        })
        .mockResolvedValueOnce({
          value: {
            key: "k2",
            value: Buffer.from(JSON.stringify({ id: "b", foo: "bar", ts: 1 })),
          },
          done: false,
        })
        .mockResolvedValueOnce({
          value: {
            key: "k3",
            value: Buffer.from(JSON.stringify({ id: "c", foo: "bar", ts: 1 })),
          },
          done: false,
        })
        .mockResolvedValue({ done: true }),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;
    const secondIterator = {
      next: jest
        .fn()
        .mockResolvedValueOnce({
          value: {
            key: "k4",
            value: Buffer.from(JSON.stringify({ id: "c", foo: "bar", ts: 1 })),
          },
          done: false,
        })
        .mockResolvedValueOnce({
          value: {
            key: "k5",
            value: Buffer.from(JSON.stringify({ id: "d", foo: "bar", ts: 2 })),
          },
          done: false,
        })
        .mockResolvedValue({ done: true }),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;
    (stub.getPrivateDataQueryResult as jest.Mock)
      .mockResolvedValueOnce({ iterator: firstIterator })
      .mockResolvedValueOnce({ iterator: secondIterator });

    const firstPage = await (proxy as any).queryResultPaginated(
      stub,
      {
        selector: { foo: "bar" },
        sort: [{ ts: "asc" }],
      },
      2,
      undefined,
      undefined,
      ctx
    );

    const bookmark = firstPage.metadata.bookmark as string;
    expect(bookmark).toBeDefined();
    expect(decodePrivateBookmark(bookmark)).toEqual(
      expect.objectContaining({
        sortField: "ts",
        direction: "asc",
        idField: "id",
        lastValue: 1,
        lastId: "b",
      })
    );

    const secondPage = await (proxy as any).queryResultPaginated(
      stub,
      {
        selector: { foo: "bar" },
        sort: [{ ts: "asc" }],
      },
      2,
      undefined,
      bookmark,
      ctx
    );

    const secondQuery = JSON.parse(
      (stub.getPrivateDataQueryResult as jest.Mock).mock.calls[1][1]
    );
    expect(secondQuery.skip).toBeUndefined();
    expect(JSON.stringify(secondQuery.selector)).not.toContain("$or");
    expect(secondPage.metadata.fetchedRecordsCount).toBe(2);
    expect(await secondPage.iterator.next()).toEqual(
      expect.objectContaining({ done: false })
    );
    expect(await secondPage.iterator.next()).toEqual(
      expect.objectContaining({ done: false })
    );
  });

  it("forPrivate paginated query synthesizes bookmark when API metadata has none", async () => {
    const proxy = adapter.callForPrivate("mirror-collection");
    const iterator = {
      next: jest
        .fn()
        .mockResolvedValueOnce({
          value: {
            key: "k1",
            value: Buffer.from(
              JSON.stringify({ id: "k1", foo: "bar", ts: 100 })
            ),
          },
          done: false,
        })
        .mockResolvedValueOnce({
          value: {
            key: "k2",
            value: Buffer.from(
              JSON.stringify({ id: "k2", foo: "bar", ts: 101 })
            ),
          },
          done: false,
        })
        .mockResolvedValue({ done: true }),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;
    (stub.getPrivateDataQueryResult as jest.Mock).mockResolvedValue(iterator);

    const response = await (proxy as any).queryResultPaginated(
      stub,
      {
        selector: { foo: "bar" },
        sort: [{ ts: "asc" }],
      },
      1,
      undefined,
      undefined,
      ctx
    );

    const calledQuery = JSON.parse(
      (stub.getPrivateDataQueryResult as jest.Mock).mock.calls[0][1]
    );
    expect(calledQuery).toEqual({
      selector: { foo: "bar" },
      sort: [{ ts: "asc" }, { id: "asc" }],
      limit: 2,
    });

    expect(response.metadata.fetchedRecordsCount).toBe(1);
    expect(response.metadata.bookmark).toBeDefined();
    expect(decodePrivateBookmark(response.metadata.bookmark as string)).toEqual(
      expect.objectContaining({
        sortField: "ts",
        direction: "asc",
        idField: "id",
        lastValue: 100,
        lastId: "k1",
      })
    );
    const first = await response.iterator.next();
    expect(first.value.key).toBe("k1");
  });

  it("forPrivate proxy routes deleteState to deletePrivateData", async () => {
    const proxy = adapter.callForPrivate("mirror-collection");
    await (proxy as any).deleteState("pk", ctx);

    expect(stub.deletePrivateData).toHaveBeenCalledWith(
      "mirror-collection",
      "pk"
    );
  });
});
