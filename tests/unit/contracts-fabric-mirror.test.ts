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

  public async callPutState(
    id: string,
    record: Record<string, any>,
    ctx: FabricContractContext
  ) {
    return this.putState(id, record, ctx);
  }

  public async callReadState(id: string, ctx: FabricContractContext) {
    return this.readState(id, ctx);
  }

  public async callQueryResult(
    stub: ChaincodeStub,
    query: Record<string, any>,
    ctx: FabricContractContext
  ) {
    return this.queryResult(stub, query, ctx);
  }

  public async callQueryResultPaginated(
    stub: ChaincodeStub,
    query: Record<string, any>,
    limit: number,
    page: number | undefined,
    bookmark: string | undefined,
    ctx: FabricContractContext
  ) {
    return this.queryResultPaginated(stub, query, limit, page, bookmark, ctx);
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

  it("overrides the repository to create a mirror in the segregated collection", async () => {
    const mirrorRepo = {
      create: jest.fn().mockResolvedValue({}),
    };
    const overrideSpy = jest.fn().mockReturnValue(mirrorRepo);
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
        segregate: "mirror-collection",
        ignoreValidation: true,
        ignoreHandlers: true,
      })
    );
    expect(mirrorRepo.create).toHaveBeenCalledWith(model, context);
  });

  it("marks reads to always target the mirror collection when the MSP matches", async () => {
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

    expect(context.get("segregated")).toBe("mirror-collection");
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

    expect(context.getOrUndefined("segregated")).toBeUndefined();
    expect(context.getReadCollections()).toHaveLength(0);
  });
});

describe("FabricContractAdapter segregated access", () => {
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

  it("routes putState to private data when segregated", async () => {
    ctx.accumulate({ segregated: "mirror-collection" });

    await adapter.callPutState("pk", { foo: "bar" }, ctx);

    expect(stub.putPrivateData).toHaveBeenCalledWith(
      "mirror-collection",
      "pk",
      expect.any(Buffer)
    );
    expect(stub.putState).not.toHaveBeenCalled();
  });

  it("reads from private data when segregated", async () => {
    ctx.accumulate({ segregated: "mirror-collection" });

    await adapter.callReadState("pk", ctx);

    expect(stub.getPrivateData).toHaveBeenCalledWith("mirror-collection", "pk");
    expect(stub.getState).not.toHaveBeenCalled();
  });

  it("executes queries against the mirror collection when segregated", async () => {
    ctx.accumulate({ segregated: "mirror-collection" });

    const query = { selector: { foo: "bar" } };
    await adapter.callQueryResult(stub as ChaincodeStub, query, ctx);

    expect(stub.getPrivateDataQueryResult).toHaveBeenCalledWith(
      "mirror-collection",
      JSON.stringify(query)
    );
    expect(stub.getQueryResult).not.toHaveBeenCalled();
  });

  it("uses private pagination when the context is segregated", async () => {
    ctx.accumulate({ segregated: "mirror-collection" });

    const query = { selector: { foo: "bar" } };
    await adapter.callQueryResultPaginated(
      stub as ChaincodeStub,
      query,
      5,
      undefined,
      undefined,
      ctx
    );

    expect(stub.getPrivateDataQueryResult).toHaveBeenCalled();
    expect(stub.getQueryResultWithPagination).not.toHaveBeenCalled();
  });
});
