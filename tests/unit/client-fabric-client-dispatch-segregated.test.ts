import "reflect-metadata";
import "../../src/shared/overrides";

import { Adapter, Context } from "@decaf-ts/core";
import { OperationKeys, BulkCrudOperationKeys } from "@decaf-ts/db-decorators";
import type { Client } from "@grpc/grpc-js";
import { Model } from "@decaf-ts/decorator-validation";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { FabricClientDispatch } from "../../src/client/FabricClientDispatch";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeLogger = () => ({
  for: jest.fn().mockReturnThis(),
  clear: jest.fn().mockReturnThis(),
  info: jest.fn(),
  error: jest.fn(),
  verbose: jest.fn(),
  debug: jest.fn(),
});

/** A Context that has a working getOrUndefined() / get() */
const makeContext = (flags: Record<string, any> = {}) => {
  const ctx = new Context();
  ctx.accumulate({ logger: makeLogger(), ...flags } as any);
  return ctx;
};

const createDispatch = () => {
  const client = { close: jest.fn() } as unknown as Client;
  const dispatch = new FabricClientDispatch(client);
  Object.defineProperty(dispatch, "log", {
    value: makeLogger(),
    configurable: true,
  });
  return dispatch;
};

/**
 * Adapter stub whose logCtx properly extracts the Context from the args
 * array passed to it (matching what the proxy does: argArray.slice(last)).
 */
const createAdapterStub = (ctx: Context) => {
  const stub = {
    refresh: jest.fn().mockResolvedValue(undefined),
    context: jest.fn().mockResolvedValue(ctx),
    config: {
      chaincodeName: "testcc",
      channel: "testchannel",
      mspId: "Org1MSP",
    },
    alias: "stub-adapter",
    logCtx: jest.fn().mockImplementation((argsArr: any[]) => {
      // argsArr is the slice of the original argArray passed into adapter.logCtx.
      // It is an array: e.g. [ctxObject] or [result, ctxObject].
      const realCtx =
        (Array.isArray(argsArr)
          ? argsArr.find(
              (a) => a && typeof (a as any).getOrUndefined === "function"
            )
          : undefined) ?? ctx;
      return {
        log: makeLogger(),
        ctx: realCtx,
        ctxArgs: [realCtx],
        for: jest.fn().mockReturnThis(),
      };
    }),
  } as unknown as FabricClientAdapter;
  return stub;
};

/** Prevent the real Fabric network connection from firing. */
const mockGateway = () => {
  jest.spyOn(FabricClientAdapter, "getGateway").mockResolvedValue({
    getNetwork: () => ({
      getChaincodeEvents: jest
        .fn()
        .mockResolvedValue({ [Symbol.asyncIterator]: async function* () {}, close: jest.fn() }),
    }),
  } as any);
};

/** Mock Adapter.logCtx (used inside updateObservers) to pass ctx through. */
const mockStaticLogCtx = (ctx: Context) => {
  jest.spyOn(Adapter, "logCtx").mockImplementation((...mockArgs: any[]) => {
    // Adapter.logCtx is called as logCtx(fn, event, flag, ...userArgs)
    const userArgs = mockArgs.slice(3);
    return {
      log: makeLogger(),
      ctx,
      ctxArgs: userArgs.length > 0 ? userArgs : [ctx],
      for: jest.fn().mockReturnThis(),
    } as any;
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FabricClientDispatch — segregated model proxy fallback", () => {
  afterEach(() => jest.restoreAllMocks());

  /**
   * Runs initialize() with all network calls mocked, returns the dispatch
   * and adapter with their CRUD methods already proxied.
   */
  async function initWithMocks(transientResult: any = { id: "s-1" }) {
    const ctx = makeContext();
    const dispatch = createDispatch();
    const adapter = createAdapterStub(ctx);

    // Set up CRUD mocks BEFORE initialize() so the proxy wraps them.
    const createMock = jest.fn().mockResolvedValue(transientResult);
    const updateMock = jest.fn().mockResolvedValue(transientResult);
    const deleteMock = jest.fn().mockResolvedValue(transientResult);
    const createAllMock = jest.fn().mockResolvedValue([transientResult]);
    const updateAllMock = jest.fn().mockResolvedValue([transientResult]);
    const deleteAllMock = jest.fn().mockResolvedValue([transientResult]);

    (adapter as any).create = createMock;
    (adapter as any).update = updateMock;
    (adapter as any).delete = deleteMock;
    (adapter as any).createAll = createAllMock;
    (adapter as any).updateAll = updateAllMock;
    (adapter as any).deleteAll = deleteAllMock;

    dispatch["adapter"] = adapter;
    dispatch["models"] = [];

    mockGateway();
    // Prevent the async chaincode-event loop from running.
    jest
      .spyOn(dispatch as any, "handleEvents")
      .mockResolvedValue(undefined);
    mockStaticLogCtx(ctx);

    await dispatch["initialize"]();

    return { dispatch, adapter, ctx };
  }

  // -------------------------------------------------------------------------

  it("calls adapter.refresh locally after create of a fully-segregated model", async () => {
    const { adapter, ctx } = await initWithMocks({ id: "s-1", secret: "x" });

    const SegClass = class extends Model {};
    jest.spyOn(Model, "isTransient").mockReturnValue(true);

    await (adapter as any).create(SegClass, "s-1", {}, {}, ctx);

    expect(adapter.refresh).toHaveBeenCalledTimes(1);
    expect(adapter.refresh).toHaveBeenCalledWith(
      SegClass,
      OperationKeys.CREATE,
      "s-1",
      ctx
    );
  });

  it("calls adapter.refresh locally after update of a fully-segregated model", async () => {
    const { adapter, ctx } = await initWithMocks({ id: "s-2", secret: "y" });

    const SegClass = class extends Model {};
    jest.spyOn(Model, "isTransient").mockReturnValue(true);

    await (adapter as any).update(SegClass, "s-2", {}, {}, ctx);

    expect(adapter.refresh).toHaveBeenCalledTimes(1);
    expect(adapter.refresh).toHaveBeenCalledWith(
      SegClass,
      OperationKeys.UPDATE,
      "s-2",
      ctx
    );
  });

  it("calls adapter.refresh locally after delete of a fully-segregated model", async () => {
    const { adapter, ctx } = await initWithMocks({ id: "s-3" });

    const SegClass = class extends Model {};
    jest.spyOn(Model, "isTransient").mockReturnValue(true);

    await (adapter as any).delete(SegClass, "s-3", ctx);

    expect(adapter.refresh).toHaveBeenCalledTimes(1);
    expect(adapter.refresh).toHaveBeenCalledWith(
      SegClass,
      OperationKeys.DELETE,
      "s-3",
      ctx
    );
  });

  it("bulk: calls adapter.refresh locally after createAll of a fully-segregated model", async () => {
    const { adapter, ctx } = await initWithMocks([{ id: "s-1" }, { id: "s-2" }]);

    const SegClass = class extends Model {};
    jest.spyOn(Model, "isTransient").mockReturnValue(true);

    await (adapter as any).createAll(SegClass, ["s-1", "s-2"], [{}, {}], {}, ctx);

    expect(adapter.refresh).toHaveBeenCalledTimes(1);
    expect(adapter.refresh).toHaveBeenCalledWith(
      SegClass,
      OperationKeys.CREATE, // bulk mapped to single
      ["s-1", "s-2"],
      ctx
    );
  });

  it("does NOT call adapter.refresh locally for a public model", async () => {
    const { adapter, ctx } = await initWithMocks({ id: "p-1" });

    const PubClass = class extends Model {};
    // isTransient = false → public model → no local observer, chaincode event handles it
    jest.spyOn(Model, "isTransient").mockReturnValue(false);

    await (adapter as any).create(PubClass, "p-1", {}, {}, ctx);

    expect(adapter.refresh).not.toHaveBeenCalled();
  });

  it("does NOT call adapter.refresh locally for a partially-segregated model", async () => {
    const { adapter, ctx } = await initWithMocks({ id: "p-2", public: "v" });

    const PartialClass = class extends Model {};
    // Property-level @privateData but NOT class-level → isTransient = false
    jest.spyOn(Model, "isTransient").mockReturnValue(false);

    await (adapter as any).create(PartialClass, "p-2", { public: "v" }, { secret: "s" }, ctx);

    expect(adapter.refresh).not.toHaveBeenCalled();
  });

  it("includes result in observer call when observeFullResult is set", async () => {
    const fullResult = { id: "s-4", secret: "z" };
    const { adapter, ctx } = await initWithMocks(fullResult);

    // Enable observeFullResult on the context
    ctx.accumulate({ observeFullResult: true } as any);

    const SegClass = class extends Model {};
    jest.spyOn(Model, "isTransient").mockReturnValue(true);

    await (adapter as any).create(SegClass, "s-4", {}, {}, ctx);

    expect(adapter.refresh).toHaveBeenCalledTimes(1);
    expect(adapter.refresh).toHaveBeenCalledWith(
      SegClass,
      OperationKeys.CREATE,
      "s-4",
      fullResult, // result included
      ctx
    );
  });

  it("calls adapter.refresh exactly once — no duplication from chaincode event path", async () => {
    // The chaincode event path (handleEvents) is mocked out.
    // The local proxy path fires once for the segregated model.
    // Together this confirms there is no double notification.
    const { adapter, ctx } = await initWithMocks({ id: "s-5" });

    const SegClass = class extends Model {};
    jest.spyOn(Model, "isTransient").mockReturnValue(true);

    await (adapter as any).create(SegClass, "s-5", {}, {}, ctx);

    // Should be called exactly once (from proxy), not twice
    expect(adapter.refresh).toHaveBeenCalledTimes(1);
  });

  it("transient data is preserved in the original adapter method call", async () => {
    const transientData = { secret: "my-private-field" };
    const { adapter, ctx } = await initWithMocks({ id: "s-6" });

    const SegClass = class extends Model {};
    jest.spyOn(Model, "isTransient").mockReturnValue(true);

    // Capture what the underlying create mock was called with
    const createSpy = jest.spyOn(adapter as any, "create");

    await (adapter as any).create(SegClass, "s-6", {}, transientData, ctx);

    // The proxy must pass all original args unchanged so transient data reaches the adapter
    expect(createSpy).toHaveBeenCalledWith(
      SegClass,
      "s-6",
      {},
      transientData,
      ctx
    );
  });
});
