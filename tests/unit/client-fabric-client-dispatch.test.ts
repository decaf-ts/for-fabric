import "reflect-metadata";

import { Adapter, UnsupportedError } from "@decaf-ts/core";
import { Context, InternalError } from "@decaf-ts/db-decorators";
import type { Client } from "@grpc/grpc-js";
import { FabricClientDispatch } from "../../src/client/FabricClientDispatch";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import * as events from "../../src/shared/events";

const createDispatch = () => {
  const client = { close: jest.fn() } as unknown as Client;
  const dispatch = new FabricClientDispatch(client);
  const log = (dispatch as any).log;
  const logFor = jest
    .spyOn(log, "for")
    .mockImplementation(() => ({ info: jest.fn(), error: jest.fn() }));
  jest.spyOn(log, "verbose").mockImplementation(() => undefined);
  jest.spyOn(log, "error").mockImplementation(() => undefined);
  return { dispatch, client, log, logFor };
};

const createAdapterStub = () => {
  const adapter = Object.create(
    FabricClientAdapter.prototype
  ) as FabricClientAdapter & {
    refresh: jest.Mock;
  };
  adapter.refresh = jest.fn();
  Object.defineProperty(adapter, "alias", {
    configurable: true,
    writable: true,
    value: "adapter-alias",
  });
  Object.defineProperty(adapter, "config", {
    configurable: true,
    writable: true,
    value: {
      chaincodeName: "contracts",
      channel: "channel-one",
      mspId: "Org1MSP",
    },
  });
  return adapter;
};

const createContext = () => {
  const ctx = new Context();
  const logger = {
    for: jest.fn().mockReturnThis(),
    clear: jest.fn().mockReturnThis(),
    info: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
  };
  ctx.accumulate({ logger } as any);
  return ctx;
};

describe("FabricClientDispatch", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("rejects observers that are not FabricClientAdapter instances", () => {
    const { dispatch } = createDispatch();
    expect(() => dispatch.observe({} as any)).toThrow(UnsupportedError);
  });

  it("configures itself when observing a FabricClientAdapter", async () => {
    const { dispatch } = createDispatch();
    const adapter = createAdapterStub();

    const modelsSpy = jest
      .spyOn(Adapter, "models")
      .mockReturnValue([{ name: "Wallet" } as any]);
    const initializeSpy = jest
      .spyOn(dispatch as any, "initialize")
      .mockResolvedValue(undefined);

    dispatch.observe(adapter);
    await Promise.resolve();

    expect(dispatch["adapter"]).toBe(adapter);
    expect(dispatch["models"]).toEqual([{ name: "Wallet" }]);
    expect(modelsSpy).toHaveBeenCalledWith(adapter.alias);
    expect(initializeSpy).toHaveBeenCalledTimes(1);
  });

  it("silently ignores updates when adapter is missing", async () => {
    const { dispatch } = createDispatch();
    const context = createContext();
    await expect(
      dispatch.updateObservers("wallets", "create", { id: "1" }, context)
    ).resolves.toBeUndefined();
  });

  it("delegates updates to the observed adapter", async () => {
    const { dispatch } = createDispatch();
    const adapter = createAdapterStub();
    dispatch["adapter"] = adapter;
    const context = createContext();

    await dispatch.updateObservers("wallets", "create", "w-1", context);
    expect(adapter.refresh).toHaveBeenCalledWith(
      "wallets",
      "create",
      "w-1",
      context
    );

    await dispatch.updateObservers("wallets", "create", undefined, context);
    expect(adapter.refresh).toHaveBeenLastCalledWith(
      "wallets",
      "create",
      undefined,
      context
    );
  });

  it("wraps refresh failures in InternalError", async () => {
    const { dispatch } = createDispatch();
    const adapter = createAdapterStub();
    adapter.refresh.mockRejectedValue(new Error("boom"));
    dispatch["adapter"] = adapter;
    const context = createContext();

    await expect(
      dispatch.updateObservers("wallets", "create", { id: "w-2" }, context)
    ).rejects.toThrow(InternalError);
  });

  it("requires the listening stack before handling events", async () => {
    const { dispatch } = createDispatch();
    dispatch["adapter"] = createAdapterStub();

    await expect((dispatch as any).handleEvents()).rejects.toThrow(
      InternalError
    );
  });

  it("requires an observed adapter before handling events", async () => {
    const { dispatch } = createDispatch();
    dispatch["listeningStack"] = {
      [Symbol.asyncIterator]: async function* () {
        yield* [];
      },
      close: jest.fn(),
    };

    await expect((dispatch as any).handleEvents()).rejects.toThrow(
      InternalError
    );
  });

  it("processes chaincode events and updates observers", async () => {
    const { dispatch } = createDispatch();
    const adapter = createAdapterStub();
    dispatch["adapter"] = adapter;
    dispatch["models"] = [{ name: "FallbackModel" }];
    const eventPayload = { id: "doc-1" };
    const parseSpy = jest
      .spyOn(events, "parseEventName")
      .mockReturnValue({ table: "wallets", event: "create", owner: "Org1MSP" });
    const updateSpy = jest
      .spyOn(dispatch, "updateObservers")
      .mockResolvedValue(undefined);

    dispatch["listeningStack"] = {
      [Symbol.asyncIterator]: async function* () {
        yield {
          eventName: "wallets_create",
          payload: new TextEncoder().encode(JSON.stringify(eventPayload)),
        };
      },
      close: jest.fn(),
    };

    await (dispatch as any).handleEvents();

    expect(parseSpy).toHaveBeenCalledWith("wallets_create");
    expect(updateSpy).toHaveBeenCalledWith(
      "wallets",
      "create",
      "doc-1",
      expect.any(Context)
    );
  });

  it.skip("falls back to first model name when event lacks table", async () => {
    const { dispatch } = createDispatch();
    const adapter = createAdapterStub();
    dispatch["adapter"] = adapter;
    dispatch["models"] = [{ name: "WalletModel" }];
    jest
      .spyOn(events, "parseEventName")
      .mockReturnValue({ table: undefined, event: "update", owner: undefined });
    const updateSpy = jest
      .spyOn(dispatch, "updateObservers")
      .mockResolvedValue(undefined);

    dispatch["listeningStack"] = {
      [Symbol.asyncIterator]: async function* () {
        yield {
          eventName: "wallets_update",
          payload: new TextEncoder().encode(JSON.stringify({})),
        };
      },
      close: jest.fn(),
    };

    await (dispatch as any).handleEvents();

    expect(updateSpy).toHaveBeenCalledWith(
      "WalletModel",
      "update",
      expect.any(Object),
      expect.any(Context)
    );
  });

  it("skips events owned by other MSPs", async () => {
    const { dispatch } = createDispatch();
    const adapter = createAdapterStub();
    dispatch["adapter"] = adapter;
    dispatch["models"] = [{ name: "WalletModel" }];
    jest
      .spyOn(events, "parseEventName")
      .mockReturnValue({ table: "wallets", event: "delete", owner: "Other" });
    const updateSpy = jest.spyOn(dispatch, "updateObservers");

    dispatch["listeningStack"] = {
      [Symbol.asyncIterator]: async function* () {
        yield {
          eventName: "wallets_delete",
          payload: new TextEncoder().encode(JSON.stringify({ id: "x" })),
        };
      },
      close: jest.fn(),
    };

    await (dispatch as any).handleEvents();

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("logs update failures and continues processing", async () => {
    const { dispatch, logFor } = createDispatch();
    const adapter = createAdapterStub();
    dispatch["adapter"] = adapter;
    dispatch["models"] = [{ name: "WalletModel" }];
    const eventSequence = [{ id: "first" }, { id: "second" }];
    jest
      .spyOn(events, "parseEventName")
      .mockReturnValue({ table: "wallets", event: "update", owner: undefined });
    const updateSpy = jest
      .spyOn(dispatch, "updateObservers")
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockResolvedValueOnce(undefined);

    dispatch["listeningStack"] = {
      [Symbol.asyncIterator]: async function* () {
        for (const payload of eventSequence) {
          yield {
            eventName: "wallets_update",
            payload: new TextEncoder().encode(JSON.stringify(payload)),
          };
        }
      },
      close: jest.fn(),
    };

    await (dispatch as any).handleEvents();

    const logEntry = logFor.mock.results.at(-1)?.value;

    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(logEntry?.error).toHaveBeenCalledWith(
      expect.stringContaining("refresh failed")
    );
  });

  it("closes the listener when reading events fails", async () => {
    const { dispatch, logFor } = createDispatch();
    const adapter = createAdapterStub();
    dispatch["adapter"] = adapter;
    dispatch["models"] = [{ name: "WalletModel" }];
    jest
      .spyOn(events, "parseEventName")
      .mockReturnValue({ table: "wallets", event: "create", owner: undefined });
    const closeSpy = jest.spyOn(dispatch, "close").mockResolvedValue(undefined);

    let iteration = 0;
    dispatch["listeningStack"] = {
      [Symbol.asyncIterator]: async function* () {
        while (iteration < 1) {
          iteration += 1;
          throw new Error("iterator failed");
        }
      },
      close: jest.fn(),
    };

    await (dispatch as any).handleEvents();

    const logEntry = logFor.mock.results.at(-1)?.value;
    expect(logEntry?.error).toHaveBeenCalledWith(
      expect.stringContaining("iterator failed")
    );
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("closes underlying iterable when close is requested", async () => {
    const { dispatch } = createDispatch();
    const closeMock = jest.fn();
    dispatch["listeningStack"] = {
      [Symbol.asyncIterator]: async function* () {
        yield* [];
      },
      close: closeMock,
    };

    await dispatch.close();
    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
