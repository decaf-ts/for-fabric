import "reflect-metadata";

import { InternalError } from "@decaf-ts/db-decorators";
import { Context } from "@decaf-ts/core";
import { ERC20Wallet } from "../../src/contracts/erc20/models";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { FabricClientDispatch } from "../../src/client/FabricClientDispatch";
import { FabricClientRepository } from "../../src/client/FabricClientRepository";
import type { PeerConfig } from "../../src/shared/types";

jest.mock("@hyperledger/fabric-gateway", () => ({
  connect: jest.fn(),
}));

jest.mock("@grpc/grpc-js", () => {
  const Client = jest.fn().mockImplementation(function Client(endpoint) {
    this.endpoint = endpoint;
    this.close = jest.fn();
  });
  return {
    Client,
    credentials: {
      createSsl: jest.fn(() => "tls"),
    },
  };
});

const config: PeerConfig = {
  cryptoPath: "/tmp",
  keyCertOrDirectoryPath: "/tmp/keystore",
  certCertOrDirectoryPath: "/tmp/signcerts",
  tlsCert: "tls-cert",
  peerEndpoint: "localhost:7051",
  peerHostAlias: "peer0.org1.example.com",
  chaincodeName: "erc20",
  mspId: "Org1MSP",
  channel: "mychannel",
};

const createLogStub = () => {
  const stub: Record<string, jest.Mock> = {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    silly: jest.fn(),
    warn: jest.fn(),
    clear: jest.fn(),
  };
  stub.for = jest.fn().mockReturnValue(stub);
  stub.clear.mockReturnValue(stub);
  return stub;
};

const attachLoggerSpies = (adapter: FabricClientAdapter) => {
  const stub = createLogStub();
  Object.defineProperty(adapter, "log", {
    get: () => stub,
    configurable: true,
  });
};

describe("FabricClientAdapter", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const newAdapter = () => {
    const adapter = new FabricClientAdapter(
      config,
      `adapter-${Math.random().toString(36).slice(2)}`
    );
    attachLoggerSpies(adapter);
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


  it("decodes Uint8Array payloads", () => {
    const adapter = newAdapter();
    expect(adapter.decode(new TextEncoder().encode("fabric-value"))).toBe(
      "fabric-value"
    );
  });

  it("exposes FabricClientRepository constructor", () => {
    const adapter = newAdapter();
    expect(adapter.repository()).toBe(FabricClientRepository);
  });

  it("rejects mismatched ids and models on createAll", async () => {
    const adapter = newAdapter();
    const context = createContext();
    await expect(
      adapter.createAll(ERC20Wallet, ["wallet-1"], [], {}, context)
    ).rejects.toThrow(InternalError);
  });

  it("parses createAll results", async () => {
    const adapter = newAdapter();
    (adapter as any).serializer = {
      serialize: jest.fn(() => JSON.stringify({ id: "wallet-1", balance: 33 })),
    };
    const submitSpy = jest
      .spyOn(adapter as any, "submitTransaction")
      .mockResolvedValue(
        new TextEncoder().encode(
          JSON.stringify([JSON.stringify({ id: "wallet-1", balance: 33 })])
        )
      );

    const context = createContext();

    const result = await adapter.createAll(
      ERC20Wallet,
      ["wallet-1"],
      [new ERC20Wallet({ id: "wallet-1", balance: 33 })],
      {},
      context
    );

    expect(result).toEqual([{ id: "wallet-1", balance: 33 }]);
    expect(submitSpy).toHaveBeenCalledWith(
      expect.any(Context),
      expect.any(String),
      expect.any(Array),
      {},
      undefined,
      "ERC20Wallet"
    );
  });

  it("wraps raw evaluation errors with parseError", async () => {
    const adapter = newAdapter();
    jest
      .spyOn(adapter as any, "evaluateTransaction")
      .mockRejectedValue(new Error("boom"));
    jest
      .spyOn(FabricClientAdapter as unknown as any, "parseError")
      .mockReturnValue(new Error("parsed"));

    const context = createContext();

    await expect(
      adapter.raw({ selector: {} }, true, ERC20Wallet, context)
    ).rejects.toThrow("parsed");
  });

  it("caches gRPC clients", () => {
    const adapter = newAdapter();
    const client = { close: jest.fn() } as any;
    const spy = jest
      .spyOn(FabricClientAdapter, "getClient")
      .mockReturnValue(client);

    expect(adapter.getClient()).toBe(client);
    expect(adapter.getClient()).toBe(client);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it.skip("creates dispatch instances bound to client", () => {
    const adapter = newAdapter();
    const fakeClient = { tag: "client" } as any;
    jest.spyOn(adapter, "getClient").mockReturnValue(fakeClient);

    const dispatch = adapter.Dispatch();

    expect(dispatch).toBeInstanceOf(FabricClientDispatch);
    expect((dispatch as any).client).toBe(fakeClient);
  });

  it("closes cached clients", async () => {
    const adapter = newAdapter();
    const client = { close: jest.fn() } as any;
    (adapter as any)._client = client;

    await adapter.close();

    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it("submits through legacy flow when mirror flags are set", async () => {
    const adapter = newAdapter();
    const legacyResult = new TextEncoder().encode("legacy");
    const legacySpy = jest
      .spyOn(adapter as any, "submitLegacyWithExplicitEndorsers")
      .mockResolvedValue(legacyResult);
    const ctx = createContext();
    ctx.accumulate({ legacy: true, allowGatewayOverride: true });

    const payload = { foo: "bar" };
    const transient = { private: "secret" };

    const result = await adapter.submitTransaction(
      ctx,
      "create",
      [payload],
      transient
    );

    expect(result).toBe(legacyResult);
    expect(legacySpy).toHaveBeenCalledTimes(1);
    const [calledCtx, method, args, transientMap, peerConfigs] =
      legacySpy.mock.calls[0];
    expect(calledCtx).toBe(ctx);
    expect(method).toBe("create");
    expect(args).toEqual([JSON.stringify(payload)]);
    expect(transientMap.private.toString()).toBe(JSON.stringify("secret"));
    expect(peerConfigs[0].peerEndpoint).toBe(config.peerEndpoint);
    legacySpy.mockRestore();
  });

  it("uses default transaction when legacy override is disabled", async () => {
    const adapter = newAdapter();
    const txnSpy = jest
      .spyOn(adapter as any, "transaction")
      .mockResolvedValue(new TextEncoder().encode("submit"));
    const ctx = createContext();
    ctx.accumulate({ legacy: true, allowGatewayOverride: false });

    await adapter.submitTransaction(ctx, "create");

    expect(txnSpy).toHaveBeenCalled();
    txnSpy.mockRestore();
  });
});
