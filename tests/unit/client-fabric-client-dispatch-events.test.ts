import "reflect-metadata";

import { Adapter } from "@decaf-ts/core";
import { Context } from "@decaf-ts/db-decorators";
import type { Client } from "@grpc/grpc-js";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { FabricClientDispatch } from "../../src/client/FabricClientDispatch";

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

const createAdapterStub = () => {
  const adapter = {
    refresh: jest.fn().mockResolvedValue(undefined),
    context: jest.fn().mockResolvedValue(createContext()),
    config: {
      chaincodeName: "testcc",
      channel: "testchannel",
      mspId: "Org1MSP",
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

  it("ignores chaincode events targeting a different MSP", async () => {
    const { dispatch } = createDispatch();
    const adapter = createAdapterStub();
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
});
