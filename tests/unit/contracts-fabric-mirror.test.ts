import "reflect-metadata";

import { Model, model } from "@decaf-ts/decorator-validation";
import { pk } from "@decaf-ts/core";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import { FabricContractAdapter } from "../../src/contracts/ContractAdapter";
import type { FabricContractRepository } from "../../src/contracts/FabricContractRepository";
import {
  createMirrorHandler,
  readMirrorHandler,
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
    context.accumulate({ logger } as any);

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
    context.accumulate({ identity, logger } as any);

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
    context.accumulate({ identity, logger } as any);

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
    const query = { selector: { foo: "bar" } };
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

  it("forPrivate proxy routes deleteState to deletePrivateData", async () => {
    const proxy = adapter.callForPrivate("mirror-collection");
    await (proxy as any).deleteState("pk", ctx);

    expect(stub.deletePrivateData).toHaveBeenCalledWith(
      "mirror-collection",
      "pk"
    );
  });
});
