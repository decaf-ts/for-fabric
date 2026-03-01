import "reflect-metadata";

import { Adapter } from "@decaf-ts/core";
import { Context } from "@decaf-ts/db-decorators";
import type { Client } from "@grpc/grpc-js";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { FabricClientDispatch } from "../../src/client/FabricClientDispatch";
import { generateFabricEventName } from "../../src/shared/events";
import type { PeerConfig } from "../../src/shared/types";

const createContext = () => {
  const ctx = new Context();
  ctx.accumulate({
    logger: {
      for: jest.fn().mockReturnThis(),
      clear: jest.fn().mockReturnThis(),
      info: jest.fn(),
      error: jest.fn(),
      verbose: jest.fn(),
      debug: jest.fn(),
    },
  } as any);
  return ctx;
};

const createDispatch = () => {
  const client = { close: jest.fn() } as unknown as Client;
  const dispatch = new FabricClientDispatch(client);
  const log = {
    for: jest.fn().mockReturnThis(),
    error: jest.fn(),
    verbose: jest.fn(),
    info: jest.fn(),
  };
  Object.defineProperty(dispatch, "log", {
    value: log,
    configurable: true,
  });
  return { dispatch, log };
};

const createAdapterStub = (configOverrides?: Partial<PeerConfig>) => {
  const adapter = {
    refresh: jest.fn().mockResolvedValue(undefined),
    context: jest.fn().mockResolvedValue(createContext()),
    config: {
      chaincodeName: "testcc",
      channel: "testchannel",
      mspId: "Org1MSP",
      ...configOverrides,
    },
    alias: "stubbed-adapter",
    logCtx: jest.fn().mockImplementation((...args: any[]) => {
      const ctx = args[0];
      const logger = {
        for: jest.fn().mockReturnThis(),
        clear: jest.fn().mockReturnThis(),
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
      };
      return {
        log: logger,
        ctx: ctx || createContext(),
        ctxArgs: ctx ? [ctx] : [createContext()],
        for: jest.fn().mockReturnThis(),
      };
    }),
  } as unknown as FabricClientAdapter;
  return adapter;
};

const mockAdapterLogCtx = (ctx: Context) => {
  const logger = {
    for: jest.fn().mockReturnThis(),
    clear: jest.fn().mockReturnThis(),
    info: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
  };
  jest.spyOn(Adapter, "logCtx").mockReturnValue({
    log: logger,
    ctx,
    ctxArgs: [ctx],
    for: jest.fn().mockReturnThis(),
  } as any);
};

describe("FabricClientDispatch events", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("forwards chaincode events to the observed adapter", async () => {
    const { dispatch } = createDispatch();
    const adapter = createAdapterStub();
    dispatch["adapter"] = adapter;
    dispatch["models"] = [{ name: "Fallback" }];
    const ctx = createContext();
    mockAdapterLogCtx(ctx);

    dispatch["listeningStack"] = {
      [Symbol.asyncIterator]: async function* () {
        yield {
          eventName: "assets_create_Org1MSP",
          payload: new TextEncoder().encode(JSON.stringify({ id: "evt-1" })),
        };
      },
      close: jest.fn(),
    };

    await (dispatch as any).handleEvents(ctx);
    expect(adapter.refresh).toHaveBeenCalledWith(
      "assets",
      "create",
      "evt-1",
      ctx
    );
  });

  it("ignores chaincode events targeting a different MSP when mspEventOnly is true", async () => {
    const { dispatch } = createDispatch();
    const adapter = createAdapterStub({ mspEventOnly: true });
    dispatch["adapter"] = adapter;
    dispatch["models"] = [{ name: "Fallback" }];
    const ctx = createContext();
    mockAdapterLogCtx(ctx);

    dispatch["listeningStack"] = {
      [Symbol.asyncIterator]: async function* () {
        yield {
          eventName: "wallets_update_OtherOrg",
          payload: new TextEncoder().encode(JSON.stringify({ id: "evt-2" })),
        };
      },
      close: jest.fn(),
    };

    await (dispatch as any).handleEvents(ctx);
    expect(adapter.refresh).not.toHaveBeenCalled();
  });

  it("forwards events from a different MSP when mspEventOnly is false (default)", async () => {
    const { dispatch } = createDispatch();
    // mspEventOnly not set — defaults to false
    const adapter = createAdapterStub();
    dispatch["adapter"] = adapter;
    dispatch["models"] = [{ name: "Fallback" }];
    const ctx = createContext();
    mockAdapterLogCtx(ctx);

    dispatch["listeningStack"] = {
      [Symbol.asyncIterator]: async function* () {
        yield {
          eventName: "wallets_update_OtherOrg",
          payload: new TextEncoder().encode(JSON.stringify({ id: "evt-x" })),
        };
      },
      close: jest.fn(),
    };

    await (dispatch as any).handleEvents(ctx);
    // Event must reach the adapter even though owner !== mspId
    expect(adapter.refresh).toHaveBeenCalledWith(
      "wallets",
      "update",
      "evt-x",
      ctx
    );
  });

  it("forwards events from the same MSP when mspEventOnly is true", async () => {
    const { dispatch } = createDispatch();
    const adapter = createAdapterStub({ mspEventOnly: true });
    dispatch["adapter"] = adapter;
    dispatch["models"] = [{ name: "Fallback" }];
    const ctx = createContext();
    mockAdapterLogCtx(ctx);

    dispatch["listeningStack"] = {
      [Symbol.asyncIterator]: async function* () {
        yield {
          eventName: "assets_create_Org1MSP",
          payload: new TextEncoder().encode(JSON.stringify({ id: "evt-y" })),
        };
      },
      close: jest.fn(),
    };

    await (dispatch as any).handleEvents(ctx);
    expect(adapter.refresh).toHaveBeenCalledWith(
      "assets",
      "create",
      "evt-y",
      ctx
    );
  });

  it("forwards events with no owner segment regardless of mspEventOnly", async () => {
    const { dispatch } = createDispatch();
    const adapter = createAdapterStub({ mspEventOnly: true });
    dispatch["adapter"] = adapter;
    dispatch["models"] = [{ name: "Fallback" }];
    const ctx = createContext();
    mockAdapterLogCtx(ctx);

    dispatch["listeningStack"] = {
      [Symbol.asyncIterator]: async function* () {
        // Event name has no owner segment (only table_event)
        yield {
          eventName: "assets_create",
          payload: new TextEncoder().encode(JSON.stringify({ id: "evt-z" })),
        };
      },
      close: jest.fn(),
    };

    await (dispatch as any).handleEvents(ctx);
    // owner is undefined → MSP filter is skipped even when mspEventOnly=true
    expect(adapter.refresh).toHaveBeenCalledWith(
      "assets",
      "create",
      "evt-z",
      ctx
    );
  });

  it("includes result payloads when provided", async () => {
    const { dispatch } = createDispatch();
    const adapter = createAdapterStub();
    dispatch["adapter"] = adapter;
    dispatch["models"] = [{ name: "Fallback" }];
    const ctx = createContext();
    mockAdapterLogCtx(ctx);

    const observerSpy = jest
      .spyOn(dispatch, "updateObservers")
      .mockResolvedValue(undefined);

    dispatch["listeningStack"] = {
      [Symbol.asyncIterator]: async function* () {
        yield {
          eventName: "assets_update_Org1MSP",
          payload: new TextEncoder().encode(
            JSON.stringify({ id: "evt-3", result: { value: 1 } })
          ),
        };
      },
      close: jest.fn(),
    };

    await (dispatch as any).handleEvents(ctx);

    expect(observerSpy).toHaveBeenCalledWith(
      "assets",
      "update",
      "evt-3",
      { value: 1 },
      expect.any(Context)
    );
  });

  it("contract-side event format (mspId in name, result in payload) reaches adapter.refresh without mspId", async () => {
    // Simulate the exact event format that FabricContractRepositoryObservableHandler
    // emits after the ContractAdapter.updateObservers fix: the mspId is encoded in the
    // event name via generateFabricEventName, and the payload carries { id, result }.
    const { dispatch } = createDispatch();
    const adapter = createAdapterStub();
    dispatch["adapter"] = adapter;
    dispatch["models"] = [{ name: "Fallback" }];
    const ctx = createContext();

    // Use a pass-through logCtx mock: returns all user args as ctxArgs so that
    // result payloads are forwarded to adapter.refresh (unlike the simple mock that
    // only returns [ctx]).
    const logger = {
      for: jest.fn().mockReturnThis(),
      clear: jest.fn().mockReturnThis(),
      info: jest.fn(),
      error: jest.fn(),
      verbose: jest.fn(),
    };
    jest.spyOn(Adapter, "logCtx").mockImplementation((...mockArgs: any[]) => {
      // Adapter.logCtx is called as logCtx(fn, event, flag, ...userArgs)
      const userArgs = mockArgs.slice(3);
      const context = userArgs[userArgs.length - 1] ?? ctx;
      return {
        log: logger,
        ctx: context,
        ctxArgs: userArgs.length > 0 ? userArgs : [ctx],
        for: jest.fn().mockReturnThis(),
      } as any;
    });

    const mspId = "Org1MSP"; // matches adapter.config.mspId
    const resultPayload = { name: "Alice", nif: "123456789" };

    // This is the event name generated by generateFabricEventName(table, event, owner)
    // where owner = mspId extracted from ctx.stub.getMspID() on the contract side.
    const eventName = generateFabricEventName("Wallet", "create", mspId);
    const eventPayload = new TextEncoder().encode(
      JSON.stringify({ id: "w-1", result: resultPayload })
    );

    dispatch["listeningStack"] = {
      [Symbol.asyncIterator]: async function* () {
        yield { eventName, payload: eventPayload };
      },
      close: jest.fn(),
    };

    await (dispatch as any).handleEvents(ctx);

    // adapter.refresh must be called with (model, event, id, result, ctx) —
    // the mspId from the event name must NOT appear in the refresh arguments.
    expect(adapter.refresh).toHaveBeenCalledWith(
      "Wallet", // table name (no mspId)
      "create",
      "w-1",
      resultPayload, // result forwarded as-is
      ctx // context (no mspId)
    );
    expect(adapter.refresh).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      mspId, // mspId must NOT appear in the args after id
      expect.anything()
    );
  });
});
