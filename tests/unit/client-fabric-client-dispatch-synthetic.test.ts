import "reflect-metadata";
import "../../src/shared/overrides";

import { Adapter, Context } from "@decaf-ts/core";
import { OperationKeys, BulkCrudOperationKeys } from "@decaf-ts/db-decorators";
import type { Client } from "@grpc/grpc-js";
import { Model } from "@decaf-ts/decorator-validation";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { FabricClientDispatch } from "../../src/client/FabricClientDispatch";
import type { PeerConfig } from "../../src/shared/types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const makeLogger = () => ({
  for: jest.fn().mockReturnThis(),
  clear: jest.fn().mockReturnThis(),
  info: jest.fn(),
  error: jest.fn(),
  verbose: jest.fn(),
  debug: jest.fn(),
  silly: jest.fn(),
  warn: jest.fn(),
});

const makeContext = (flags: Record<string, any> = {}) => {
  const ctx = new Context();
  ctx.accumulate({ logger: makeLogger(), ...flags } as any);
  return ctx;
};

const makeClient = () => ({ close: jest.fn() } as unknown as Client);

const createDispatch = (client?: Client) => {
  const dispatch = new FabricClientDispatch(client ?? makeClient());
  Object.defineProperty(dispatch, "log", {
    value: makeLogger(),
    configurable: true,
  });
  return dispatch;
};

const createAdapterStub = (configOverrides: Partial<PeerConfig> = {}) => {
  const ctx = makeContext();
  const stub = {
    refresh: jest.fn().mockResolvedValue(undefined),
    context: jest.fn().mockResolvedValue(ctx),
    config: {
      chaincodeName: "testcc",
      channel: "testchannel",
      mspId: "Org1MSP",
      syntheticEvents: true, // default
      ...configOverrides,
    },
    alias: "stub-adapter",
    logCtx: jest.fn().mockImplementation((argsArr: any[]) => {
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
  return { stub, ctx };
};

const mockStaticLogCtx = (ctx: Context) => {
  jest.spyOn(Adapter, "logCtx").mockImplementation((...mockArgs: any[]) => {
    const userArgs = mockArgs.slice(3);
    return {
      log: makeLogger(),
      ctx,
      ctxArgs: userArgs.length > 0 ? userArgs : [ctx],
      for: jest.fn().mockReturnThis(),
    } as any;
  });
};

const mockGetGateway = () => {
  const listeningStackClose = jest.fn();
  const getChaincodeEventsMock = jest
    .fn()
    .mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {},
      close: listeningStackClose,
    });
  const getGatewaySpy = jest
    .spyOn(FabricClientAdapter, "getGateway")
    .mockResolvedValue({
      getNetwork: () => ({ getChaincodeEvents: getChaincodeEventsMock }),
    } as any);
  return { getGatewaySpy, getChaincodeEventsMock, listeningStackClose };
};

// ---------------------------------------------------------------------------
// Suite 1: syntheticEvents = true (default)
// ---------------------------------------------------------------------------

describe("FabricClientDispatch — syntheticEvents: true (default)", () => {
  afterEach(() => jest.restoreAllMocks());

  async function initSynthetic(configOverrides: Partial<PeerConfig> = {}) {
    const { stub: adapter, ctx } = createAdapterStub({
      syntheticEvents: true,
      ...configOverrides,
    });
    const dispatch = createDispatch();

    const createMock = jest.fn().mockResolvedValue({ id: "x-1" });
    const updateMock = jest.fn().mockResolvedValue({ id: "x-1" });
    const deleteMock = jest.fn().mockResolvedValue({ id: "x-1" });
    const createAllMock = jest.fn().mockResolvedValue([{ id: "x-1" }]);
    const updateAllMock = jest.fn().mockResolvedValue([{ id: "x-1" }]);
    const deleteAllMock = jest.fn().mockResolvedValue([{ id: "x-1" }]);

    (adapter as any).create = createMock;
    (adapter as any).update = updateMock;
    (adapter as any).delete = deleteMock;
    (adapter as any).createAll = createAllMock;
    (adapter as any).updateAll = updateAllMock;
    (adapter as any).deleteAll = deleteAllMock;

    dispatch["adapter"] = adapter;
    dispatch["models"] = [];

    jest.spyOn(dispatch as any, "handleEvents").mockResolvedValue(undefined);
    mockStaticLogCtx(ctx);

    await dispatch["initialize"]();
    return { dispatch, adapter, ctx };
  }

  it("does NOT open a gateway connection", async () => {
    const getGatewaySpy = jest
      .spyOn(FabricClientAdapter, "getGateway")
      .mockResolvedValue({} as any);

    await initSynthetic();

    expect(getGatewaySpy).not.toHaveBeenCalled();
  });

  it("does NOT set a listeningStack", async () => {
    jest
      .spyOn(FabricClientAdapter, "getGateway")
      .mockResolvedValue({} as any);

    const { dispatch } = await initSynthetic();

    expect((dispatch as any).listeningStack).toBeUndefined();
  });

  it("fires updateObservers for a PUBLIC model (no isTransient guard)", async () => {
    const { adapter, ctx } = await initSynthetic();

    const PubClass = class extends Model {};
    jest.spyOn(Model, "isTransient").mockReturnValue(false);

    await (adapter as any).create(PubClass, "p-1", {}, {}, ctx);

    expect(adapter.refresh).toHaveBeenCalledTimes(1);
    expect(adapter.refresh).toHaveBeenCalledWith(
      PubClass,
      OperationKeys.CREATE,
      "p-1",
      ctx
    );
  });

  it("fires updateObservers for a TRANSIENT model", async () => {
    const { adapter, ctx } = await initSynthetic();

    const TransClass = class extends Model {};
    jest.spyOn(Model, "isTransient").mockReturnValue(true);

    await (adapter as any).update(TransClass, "t-1", {}, {}, ctx);

    expect(adapter.refresh).toHaveBeenCalledTimes(1);
    expect(adapter.refresh).toHaveBeenCalledWith(
      TransClass,
      OperationKeys.UPDATE,
      "t-1",
      ctx
    );
  });

  it("fires updateObservers for DELETE", async () => {
    const { adapter, ctx } = await initSynthetic();

    const AnyClass = class extends Model {};
    jest.spyOn(Model, "isTransient").mockReturnValue(false);

    await (adapter as any).delete(AnyClass, "d-1", ctx);

    expect(adapter.refresh).toHaveBeenCalledWith(
      AnyClass,
      OperationKeys.DELETE,
      "d-1",
      ctx
    );
  });

  it("maps createAll → CREATE event", async () => {
    const { adapter, ctx } = await initSynthetic();

    const AnyClass = class extends Model {};
    jest.spyOn(Model, "isTransient").mockReturnValue(false);

    await (adapter as any).createAll(AnyClass, ["a", "b"], [{}, {}], {}, ctx);

    expect(adapter.refresh).toHaveBeenCalledWith(
      AnyClass,
      OperationKeys.CREATE,
      ["a", "b"],
      ctx
    );
  });

  it("maps deleteAll → DELETE event", async () => {
    const { adapter, ctx } = await initSynthetic();

    const AnyClass = class extends Model {};
    jest.spyOn(Model, "isTransient").mockReturnValue(false);

    await (adapter as any).deleteAll(AnyClass, ["a", "b"], ctx);

    expect(adapter.refresh).toHaveBeenCalledWith(
      AnyClass,
      OperationKeys.DELETE,
      ["a", "b"],
      ctx
    );
  });
});

// ---------------------------------------------------------------------------
// Suite 2: syntheticEvents = false (gateway path)
// ---------------------------------------------------------------------------

describe("FabricClientDispatch — syntheticEvents: false (gateway path)", () => {
  afterEach(() => jest.restoreAllMocks());

  async function initGateway() {
    const { stub: adapter, ctx } = createAdapterStub({
      syntheticEvents: false,
    });
    const dispatch = createDispatch();

    const createMock = jest.fn().mockResolvedValue({ id: "g-1" });
    (adapter as any).create = createMock;
    (adapter as any).update = jest.fn().mockResolvedValue({ id: "g-1" });
    (adapter as any).delete = jest.fn().mockResolvedValue({ id: "g-1" });
    (adapter as any).createAll = jest
      .fn()
      .mockResolvedValue([{ id: "g-1" }]);
    (adapter as any).updateAll = jest
      .fn()
      .mockResolvedValue([{ id: "g-1" }]);
    (adapter as any).deleteAll = jest
      .fn()
      .mockResolvedValue([{ id: "g-1" }]);

    dispatch["adapter"] = adapter;
    dispatch["models"] = [];

    const { getGatewaySpy, getChaincodeEventsMock, listeningStackClose } =
      mockGetGateway();
    jest.spyOn(dispatch as any, "handleEvents").mockResolvedValue(undefined);
    mockStaticLogCtx(ctx);

    await dispatch["initialize"]();

    return {
      dispatch,
      adapter,
      ctx,
      getGatewaySpy,
      getChaincodeEventsMock,
      listeningStackClose,
    };
  }

  it("opens a gateway connection", async () => {
    const { getGatewaySpy } = await initGateway();
    expect(getGatewaySpy).toHaveBeenCalledTimes(1);
  });

  it("subscribes to chaincode events", async () => {
    const { getChaincodeEventsMock } = await initGateway();
    expect(getChaincodeEventsMock).toHaveBeenCalledWith("testcc");
  });

  it("sets listeningStack", async () => {
    const { dispatch } = await initGateway();
    expect((dispatch as any).listeningStack).toBeDefined();
  });

  it("does NOT fire for a public model (gateway handles it)", async () => {
    const { adapter, ctx } = await initGateway();

    const PubClass = class extends Model {};
    jest.spyOn(Model, "isTransient").mockReturnValue(false);

    await (adapter as any).create(PubClass, "p-1", {}, {}, ctx);

    expect(adapter.refresh).not.toHaveBeenCalled();
  });

  it("DOES fire locally for a fully-segregated (transient) model", async () => {
    const { adapter, ctx } = await initGateway();

    const SegClass = class extends Model {};
    jest.spyOn(Model, "isTransient").mockReturnValue(true);

    await (adapter as any).create(SegClass, "s-1", {}, {}, ctx);

    expect(adapter.refresh).toHaveBeenCalledWith(
      SegClass,
      OperationKeys.CREATE,
      "s-1",
      ctx
    );
  });

  it("closes the listeningStack on dispatch.close()", async () => {
    const { dispatch, listeningStackClose } = await initGateway();

    await dispatch.close();

    expect(listeningStackClose).toHaveBeenCalledTimes(1);
    expect((dispatch as any).listeningStack).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 3: FabricClientAdapter shutdown procedure
// ---------------------------------------------------------------------------

describe("FabricClientAdapter — shutdown procedure", () => {
  const makePeerConfig = (overrides: Partial<PeerConfig> = {}): PeerConfig => ({
    cryptoPath: "/tmp",
    keyCertOrDirectoryPath: "key",
    certCertOrDirectoryPath: "cert",
    tlsCert: "tls",
    peerEndpoint: "localhost:7051",
    peerHostAlias: "peer0.org1.example.com",
    chaincodeName: "testcc",
    mspId: "Org1MSP",
    channel: "mychannel",
    evaluateTimeout: 5,
    endorseTimeout: 15,
    submitTimeout: 5,
    commitTimeout: 60,
    ...overrides,
  });

  afterEach(() => jest.restoreAllMocks());

  it("closes the gRPC client on shutdown (syntheticEvents: true)", async () => {
    const adapter = new FabricClientAdapter(
      makePeerConfig({ syntheticEvents: true }),
      `adapter-${Math.random()}`
    );
    const fakeClient = { close: jest.fn() };
    (adapter as any)._client = fakeClient;

    await adapter.shutdown();

    expect(fakeClient.close).toHaveBeenCalledTimes(1);
  });

  it("closes the gRPC client on shutdown (syntheticEvents: false)", async () => {
    const adapter = new FabricClientAdapter(
      makePeerConfig({ syntheticEvents: false }),
      `adapter-${Math.random()}`
    );
    const fakeClient = { close: jest.fn() };
    (adapter as any)._client = fakeClient;

    await adapter.shutdown();

    expect(fakeClient.close).toHaveBeenCalledTimes(1);
  });

  it("closes the dispatch (and its listeningStack) when syntheticEvents: false", async () => {
    const adapter = new FabricClientAdapter(
      makePeerConfig({ syntheticEvents: false }),
      `adapter-${Math.random()}`
    );
    const fakeClient = { close: jest.fn() };
    (adapter as any)._client = fakeClient;

    // Attach a mock dispatch with a listeningStack
    const mockDispatch = {
      close: jest.fn().mockResolvedValue(undefined),
    };
    (adapter as any).dispatch = mockDispatch;

    await adapter.shutdown();

    expect(mockDispatch.close).toHaveBeenCalledTimes(1);
    expect(fakeClient.close).toHaveBeenCalledTimes(1);
  });

  it("closes the dispatch even when syntheticEvents: true", async () => {
    const adapter = new FabricClientAdapter(
      makePeerConfig({ syntheticEvents: true }),
      `adapter-${Math.random()}`
    );
    const fakeClient = { close: jest.fn() };
    (adapter as any)._client = fakeClient;

    const mockDispatch = {
      close: jest.fn().mockResolvedValue(undefined),
    };
    (adapter as any).dispatch = mockDispatch;

    await adapter.shutdown();

    // dispatch.close() called regardless of syntheticEvents
    expect(mockDispatch.close).toHaveBeenCalledTimes(1);
    expect(fakeClient.close).toHaveBeenCalledTimes(1);
  });

  it("does not throw when no dispatch or client is attached", async () => {
    const adapter = new FabricClientAdapter(
      makePeerConfig({ syntheticEvents: true }),
      `adapter-${Math.random()}`
    );
    // Stub getClient so accessing this.client doesn't hit the filesystem
    jest.spyOn(adapter, "getClient").mockReturnValue(undefined as any);
    // no dispatch set
    await expect(adapter.shutdown()).resolves.toBeUndefined();
  });

  it("Dispatch() passes the gRPC client to FabricClientDispatch", () => {
    const adapter = new FabricClientAdapter(
      makePeerConfig({ syntheticEvents: true }),
      `adapter-${Math.random()}`
    );
    const fakeClient = { close: jest.fn() } as unknown as Client;
    jest.spyOn(adapter, "getClient").mockReturnValue(fakeClient);

    const dispatch = adapter.Dispatch();

    expect(dispatch).toBeInstanceOf(FabricClientDispatch);
    expect((dispatch as any).client).toBe(fakeClient);
  });

  it("syntheticEvents defaults to true in DefaultFabricClientFlags", () => {
    const adapter = new FabricClientAdapter(
      makePeerConfig(),
      `adapter-${Math.random()}`
    );
    // syntheticEvents not specified in makePeerConfig — should default to true
    expect(adapter.config.syntheticEvents).toBe(true);
  });

  it("syntheticEvents can be set to false via config", () => {
    const adapter = new FabricClientAdapter(
      makePeerConfig({ syntheticEvents: false }),
      `adapter-${Math.random()}`
    );
    expect(adapter.config.syntheticEvents).toBe(false);
  });
});
