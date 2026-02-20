import "reflect-metadata";

import {
  InternalError,
  OperationKeys,
  UnsupportedError,
} from "@decaf-ts/db-decorators";
import { Context, PreparedStatementKeys } from "@decaf-ts/core";
import { ModelKeys } from "@decaf-ts/decorator-validation";
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

jest.mock("fabric-network", () => {
  const legacyTransactionMock = {
    submit: jest.fn().mockResolvedValue(Buffer.from("legacy")),
    setTransient: jest.fn().mockReturnThis(),
    setEndorsingPeers: jest.fn().mockReturnThis(),
  };
  const legacyContractMock = {
    createTransaction: jest.fn(() => legacyTransactionMock),
  };
  const legacyNetworkMock = {
    getContract: jest.fn(() => legacyContractMock),
    getChannel: jest.fn(() => ({
      getEndorser: jest.fn(() => ({})),
    })),
  };
  const legacyGatewayConnectMock = jest.fn();
  const legacyGatewayDisconnectMock = jest.fn();

  const Gateway = jest.fn().mockImplementation(() => ({
    connect: legacyGatewayConnectMock,
    getNetwork: jest.fn(() => legacyNetworkMock),
    disconnect: legacyGatewayDisconnectMock,
  }));

  return {
    Gateway,
    Wallets: {
      newInMemoryWallet: jest.fn().mockResolvedValue({
        put: jest.fn(),
      }),
    },
    __mocks: {
      transaction: legacyTransactionMock,
      contract: legacyContractMock,
      network: legacyNetworkMock,
      gatewayConnect: legacyGatewayConnectMock,
      gatewayDisconnect: legacyGatewayDisconnectMock,
    },
  };
});

const fabricNetworkMocks = jest.requireMock("fabric-network") as any;
const {
  transaction: legacyTransactionMock,
  contract: legacyContractMock,
  network: legacyNetworkMock,
  gatewayConnect: legacyGatewayConnectMock,
  gatewayDisconnect: legacyGatewayDisconnectMock,
} = fabricNetworkMocks.__mocks;

const mockKeyPem =
  "-----BEGIN PRIVATE KEY-----\nMIICeAIBADANBgkqhkiG9w0BAQEFAASCAmIwggJeAgEAAoGBAMock\n-----END PRIVATE KEY-----";
const mockCertPem =
  "-----BEGIN CERTIFICATE-----\nMIIC0jCCAbqgAwIBAgIJAJEd\n-----END CERTIFICATE-----";

const MIRROR_MSP = "MirrorMSP";

const config: PeerConfig = {
  cryptoPath: "/tmp",
  keyCertOrDirectoryPath: mockKeyPem,
  certCertOrDirectoryPath: mockCertPem,
  tlsCert: mockCertPem,
  allowGatewayOverride: false,
  mspMap: {
    [MIRROR_MSP]: [
      {
        endpoint: "mirror-peer-1:8051",
        alias: "peer0.mirror.example.com",
        tlsCert: mockCertPem,
      },
      {
        endpoint: "mirror-peer-2:9051",
        alias: "peer1.mirror.example.com",
      },
    ],
  },
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
    legacyGatewayConnectMock.mockReset();
    legacyGatewayDisconnectMock.mockReset();
    legacyContractMock.createTransaction.mockClear();
    legacyNetworkMock.getContract.mockClear();
    legacyNetworkMock.getChannel.mockClear();
    legacyTransactionMock.submit.mockClear();
    legacyTransactionMock.setTransient.mockClear();
    legacyTransactionMock.setEndorsingPeers.mockClear();
  });

  const newAdapter = (overrides: Partial<PeerConfig> = {}) => {
    const adapter = new FabricClientAdapter(
      Object.assign({}, config, overrides),
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
    const adapter = newAdapter({ allowGatewayOverride: true });
    const legacyResult = new TextEncoder().encode("legacy");
    const legacySpy = jest
      .spyOn(adapter as any, "submitLegacyWithExplicitEndorsers")
      .mockResolvedValue(legacyResult);
    const ctx = createContext();
    ctx.accumulate({ legacy: true });

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
    expect(peerConfigs[0]).toMatchObject({
      mspId: config.mspId,
      peerEndpoint: config.peerEndpoint,
      peerHostAlias: config.peerHostAlias,
      tlsCert: config.tlsCert,
    });
    legacySpy.mockRestore();
  });

  it("uses default transaction when legacy override is disabled", async () => {
    const adapter = newAdapter({ allowGatewayOverride: false });
    const txnSpy = jest
      .spyOn(adapter as any, "transaction")
      .mockResolvedValue(new TextEncoder().encode("submit"));
    const ctx = createContext();
    ctx.accumulate({ legacy: true });

    await adapter.submitTransaction(ctx, "create");

    expect(txnSpy).toHaveBeenCalled();
    txnSpy.mockRestore();
  });

  it("adds mapped peers for additional endorsers when submitting legacy transactions", async () => {
    const adapter = newAdapter({ allowGatewayOverride: true });
    const legacySpy = jest
      .spyOn(adapter as any, "submitLegacyWithExplicitEndorsers")
      .mockResolvedValue(new TextEncoder().encode("legacy"));
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.75);
    const ctx = createContext();
    ctx.accumulate({
      legacy: true,
      endorsingOrgs: [config.mspId, MIRROR_MSP],
    });

    await adapter.submitTransaction(ctx, "create");

    const peerConfigs = legacySpy.mock.calls[0][4];
    expect(peerConfigs).toHaveLength(2);
    expect(peerConfigs[1]).toMatchObject({
      mspId: MIRROR_MSP,
      peerEndpoint: "mirror-peer-2:9051",
      peerHostAlias: "peer1.mirror.example.com",
      tlsCert: config.tlsCert,
    });
    randomSpy.mockRestore();
    legacySpy.mockRestore();
  });

  it("selects up to legacyMspCount peers per MSP when provided", async () => {
    const adapter = newAdapter({
      allowGatewayOverride: true,
      legacyMspCount: 2,
    });
    const legacySpy = jest
      .spyOn(adapter as any, "submitLegacyWithExplicitEndorsers")
      .mockResolvedValue(new TextEncoder().encode("legacy"));
    const randomSpy = jest
      .spyOn(Math, "random")
      .mockReturnValue(0.1); // deterministic selection order
    const ctx = createContext();
    ctx.accumulate({
      legacy: true,
      endorsingOrgs: [config.mspId, MIRROR_MSP],
    });

    await adapter.submitTransaction(ctx, "create");

    const peerConfigs = legacySpy.mock.calls[0][4];
    const extraPeers = peerConfigs.filter(
      (peer) => peer.mspId === MIRROR_MSP
    );
    expect(extraPeers).toHaveLength(2);

    randomSpy.mockRestore();
    legacySpy.mockRestore();
  });

  it("throws when required MSP is missing from mspMap", async () => {
    const adapter = newAdapter({
      allowGatewayOverride: true,
      mspMap: {},
    });
    const ctx = createContext();
    ctx.accumulate({
      legacy: true,
      endorsingOrgs: [config.mspId, "UnknownMSP"],
    });

    await expect(adapter.submitTransaction(ctx, "create")).rejects.toThrow(
      UnsupportedError
    );
  });

  it("refreshes model after create when transient data exist", async () => {
    const adapter = newAdapter();
    const ctx = createContext();
    const payload = { foo: "bar" };
    const transient = { secret: "value" };
    const serializedResult = {
      [ModelKeys.ANCHOR]: "ERC20Wallet",
      id: "wallet-1",
      foo: "bar",
    };
    jest
      .spyOn(adapter as any, "submitTransaction")
      .mockResolvedValue(
        new TextEncoder().encode(JSON.stringify(serializedResult))
      );
    const readSpy = jest
      .spyOn(adapter, "read")
      .mockResolvedValueOnce({ ...serializedResult, secret: "value" } as any);

    const result = await adapter.create(
      ERC20Wallet,
      "wallet-1",
      payload,
      transient,
      ctx
    );

    expect(readSpy).toHaveBeenCalledWith(ERC20Wallet, "wallet-1", ctx);
    expect(result).not.toEqual(serializedResult);
    expect(result).toEqual({ ...serializedResult, secret: "value" });
  });

  it("refreshes model after update when transient data exist", async () => {
    const adapter = newAdapter();
    const ctx = createContext();
    const payload = { foo: "baz" };
    const transient = { secret: "new" };
    const serializedResult = {
      [ModelKeys.ANCHOR]: "ERC20Wallet",
      id: "wallet-1",
      foo: "baz",
    };
    jest
      .spyOn(adapter as any, "submitTransaction")
      .mockResolvedValue(
        new TextEncoder().encode(JSON.stringify(serializedResult))
      );
    const readSpy = jest.spyOn(adapter, "read").mockResolvedValueOnce({
      ...serializedResult,
      secret: "new",
      createdBy: "system",
      createdAt: "2026-02-13T00:00:00.000Z",
      updatedBy: "system",
      updatedAt: "2026-02-13T00:00:00.000Z",
    } as any);

    const result = await adapter.update(
      ERC20Wallet,
      "wallet-1",
      payload,
      transient,
      ctx
    );

    expect(readSpy).toHaveBeenCalledWith(ERC20Wallet, "wallet-1", ctx);
    expect(result).not.toEqual(serializedResult);
    expect(result).toEqual({
      ...serializedResult,
      secret: "new",
      createdBy: "system",
      createdAt: "2026-02-13T00:00:00.000Z",
      updatedBy: "system",
      updatedAt: "2026-02-13T00:00:00.000Z",
    });
  });

  const expectTransientApplied = (
    adapter: FabricClientAdapter,
    ctx: Context,
    transient: Record<string, string>
  ) =>
    adapter.revert(
      { id: "transient-wallet" },
      ERC20Wallet,
      "transient-wallet",
      transient,
      ctx
    );

  it("rebuilds transient data for read contexts", () => {
    const adapter = newAdapter();
    const ctx = new Context();
    ctx.accumulate({ rebuildWithTransient: true, operation: "read" });
    const rebuilt = expectTransientApplied(adapter, ctx, { token: "read" });

    expect((rebuilt as any).token).toBe("read");
  });

  it("rebuilds transient data for query contexts", () => {
    const adapter = newAdapter();
    const ctx = new Context();
    ctx.accumulate({ rebuildWithTransient: true, operation: "find" });
    const rebuilt = expectTransientApplied(adapter, ctx, { token: "query" });

    expect((rebuilt as any).token).toBe("query");
  });

  it("rebuilds transient data from a context override", () => {
    const adapter = newAdapter();
    const baseCtx = new Context();
    const overrideCtx = baseCtx.override({
      rebuildWithTransient: true,
      operation: "read",
    }) as unknown as Context;
    const rebuilt = expectTransientApplied(adapter, overrideCtx, {
      token: "override",
    });

    expect((rebuilt as any).token).toBe("override");
  });

  it("ensures rebuild applies transient for reads and queries", () => {
    const adapter = newAdapter();
    const readCtx = new Context();
    readCtx.accumulate({ rebuildWithTransient: true, operation: "read" });
    const queryCtx = new Context();
    queryCtx.accumulate({ rebuildWithTransient: true, operation: "find" });

    const readResult = adapter.revert(
      { id: "read-wallet" },
      ERC20Wallet,
      "read-wallet",
      { token: "read" },
      readCtx
    );
    const queryResult = adapter.revert(
      { id: "query-wallet" },
      ERC20Wallet,
      "query-wallet",
      { token: "query" },
      queryCtx
    );
    const overrideCtx = new Context().accumulate({}).override({
      rebuildWithTransient: true,
      operation: "read",
    }) as unknown as Context;
    const overrideResult = adapter.revert(
      { id: "override-wallet" },
      ERC20Wallet,
      "override-wallet",
      { token: "override" },
      overrideCtx
    );

    expect((readResult as any).token).toBe("read");
    expect((queryResult as any).token).toBe("query");
    expect((overrideResult as any).token).toBe("override");
  });

  it("implicitly rebuilds transient data for read operations", () => {
    const adapter = newAdapter();
    const ctx = new Context();
    ctx.accumulate({ operation: OperationKeys.READ });
    const result = expectTransientApplied(adapter, ctx, {
      token: "auto-read",
    });

    expect((result as any).token).toBe("auto-read");
  });

  it("implicitly rebuilds transient data for query operations", () => {
    const adapter = newAdapter();
    const ctx = new Context();
    ctx.accumulate({ operation: PreparedStatementKeys.FIND });
    const result = expectTransientApplied(adapter, ctx, {
      token: "auto-query",
    });

    expect((result as any).token).toBe("auto-query");
  });

  describe("CRUD single operations", () => {
    it("create calls submitTransaction with serialized model", async () => {
      const adapter = newAdapter();
      const ctx = createContext();
      const serialized = {
        [ModelKeys.ANCHOR]: "ERC20Wallet",
        id: "w-1",
        token: "TK",
        balance: 100,
      };
      const submitSpy = jest
        .spyOn(adapter as any, "submitTransaction")
        .mockResolvedValue(
          new TextEncoder().encode(JSON.stringify(serialized))
        );

      const result = await adapter.create(
        ERC20Wallet,
        "w-1",
        serialized,
        {},
        ctx
      );

      expect(submitSpy).toHaveBeenCalledWith(
        expect.any(Context),
        OperationKeys.CREATE,
        expect.any(Array),
        {},
        undefined,
        "ERC20Wallet"
      );
      expect(result.id).toBe("w-1");
    });

    it("read calls evaluateTransaction", async () => {
      const adapter = newAdapter();
      const ctx = createContext();
      const serialized = {
        [ModelKeys.ANCHOR]: "ERC20Wallet",
        id: "w-2",
        token: "TK",
        balance: 50,
      };
      jest
        .spyOn(adapter as any, "evaluateTransaction")
        .mockResolvedValue(
          new TextEncoder().encode(JSON.stringify(serialized))
        );

      const result = await adapter.read(ERC20Wallet, "w-2", ctx);

      expect(result.id).toBe("w-2");
      expect(result.token).toBe("TK");
    });

    it("update calls submitTransaction with serialized model", async () => {
      const adapter = newAdapter();
      const ctx = createContext();
      const serialized = {
        [ModelKeys.ANCHOR]: "ERC20Wallet",
        id: "w-3",
        token: "TK",
        balance: 200,
      };
      const submitSpy = jest
        .spyOn(adapter as any, "submitTransaction")
        .mockResolvedValue(
          new TextEncoder().encode(JSON.stringify(serialized))
        );

      const result = await adapter.update(
        ERC20Wallet,
        "w-3",
        serialized,
        {},
        ctx
      );

      expect(submitSpy).toHaveBeenCalledWith(
        expect.any(Context),
        OperationKeys.UPDATE,
        expect.any(Array),
        {},
        undefined,
        "ERC20Wallet"
      );
      expect(result.id).toBe("w-3");
    });

    it("delete calls submitTransaction with id", async () => {
      const adapter = newAdapter();
      const ctx = createContext();
      const serialized = {
        [ModelKeys.ANCHOR]: "ERC20Wallet",
        id: "w-4",
        token: "TK",
        balance: 0,
      };
      const submitSpy = jest
        .spyOn(adapter as any, "submitTransaction")
        .mockResolvedValue(
          new TextEncoder().encode(JSON.stringify(serialized))
        );

      const result = await adapter.delete(ERC20Wallet, "w-4", ctx);

      expect(submitSpy).toHaveBeenCalledWith(
        expect.any(Context),
        OperationKeys.DELETE,
        ["w-4"],
        undefined,
        undefined,
        "ERC20Wallet"
      );
      expect(result.id).toBe("w-4");
    });
  });

  describe("Bulk operations", () => {
    it("readAll calls evaluateTransaction with serialized ids", async () => {
      const adapter = newAdapter();
      const ctx = createContext();
      const records = [
        { id: "w-1", token: "TK", balance: 10 },
        { id: "w-2", token: "TK", balance: 20 },
      ];
      const evalSpy = jest
        .spyOn(adapter as any, "evaluateTransaction")
        .mockResolvedValue(
          new TextEncoder().encode(JSON.stringify(records.map((r) => JSON.stringify(r))))
        );

      const result = await adapter.readAll(
        ERC20Wallet,
        ["w-1", "w-2"],
        ctx
      );

      expect(evalSpy).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it("updateAll calls submitTransaction with serialized models", async () => {
      const adapter = newAdapter();
      (adapter as any).serializer = {
        serialize: jest.fn((m: any) => JSON.stringify(m)),
      };
      const ctx = createContext();
      const records = [
        { id: "w-1", token: "TK", balance: 100 },
        { id: "w-2", token: "TK", balance: 200 },
      ];
      const submitSpy = jest
        .spyOn(adapter as any, "submitTransaction")
        .mockResolvedValue(
          new TextEncoder().encode(
            JSON.stringify(records.map((r) => JSON.stringify(r)))
          )
        );

      const result = await adapter.updateAll(
        ERC20Wallet,
        ["w-1", "w-2"],
        records.map((r) => new ERC20Wallet(r)),
        {},
        ctx
      );

      expect(submitSpy).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it("deleteAll calls submitTransaction with serialized ids", async () => {
      const adapter = newAdapter();
      const ctx = createContext();
      const records = [
        { id: "w-1", token: "TK", balance: 0 },
        { id: "w-2", token: "TK", balance: 0 },
      ];
      const submitSpy = jest
        .spyOn(adapter as any, "submitTransaction")
        .mockResolvedValue(
          new TextEncoder().encode(
            JSON.stringify(records.map((r) => JSON.stringify(r)))
          )
        );

      const result = await adapter.deleteAll(
        ERC20Wallet,
        ["w-1", "w-2"],
        ctx
      );

      expect(submitSpy).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it("rejects mismatched ids and models on updateAll", async () => {
      const adapter = newAdapter();
      const ctx = createContext();

      await expect(
        adapter.updateAll(ERC20Wallet, ["w-1"], [], ctx)
      ).rejects.toThrow(InternalError);
    });
  });

  describe("Legacy endorsement flow", () => {
    it("does NOT use legacy gateway when only mirror flag is set (no allowGatewayOverride)", async () => {
      const adapter = newAdapter();
      const txnSpy = jest
        .spyOn(adapter as any, "transaction")
        .mockResolvedValue(new TextEncoder().encode("default"));
      const legacySpy = jest.spyOn(
        adapter as any,
        "submitLegacyWithExplicitEndorsers"
      );
      const ctx = createContext();
      ctx.accumulate({ mirror: true }); // mirror only, no allowGatewayOverride

      await adapter.submitTransaction(ctx, "create");

      expect(txnSpy).toHaveBeenCalled();
      expect(legacySpy).not.toHaveBeenCalled();
    });

    it("does NOT use legacy gateway when only legacy is set without allowGatewayOverride", async () => {
      const adapter = newAdapter();
      const txnSpy = jest
        .spyOn(adapter as any, "transaction")
        .mockResolvedValue(new TextEncoder().encode("default"));
      const legacySpy = jest.spyOn(
        adapter as any,
        "submitLegacyWithExplicitEndorsers"
      );
      const ctx = createContext();
      ctx.accumulate({ legacy: true }); // legacy only, no allowGatewayOverride

      await adapter.submitTransaction(ctx, "create");

      expect(txnSpy).toHaveBeenCalled();
      expect(legacySpy).not.toHaveBeenCalled();
    });

    it("uses legacy gateway when both legacy AND allowGatewayOverride are set", async () => {
      const adapter = newAdapter({ allowGatewayOverride: true });
      const legacySpy = jest
        .spyOn(adapter as any, "submitLegacyWithExplicitEndorsers")
        .mockResolvedValue(new TextEncoder().encode("legacy"));
      const ctx = createContext();
      ctx.accumulate({ legacy: true });

      await adapter.submitTransaction(ctx, "create", ["data"]);

      expect(legacySpy).toHaveBeenCalledTimes(1);
    });

    it("stringifies non-string args for legacy flow", async () => {
      const adapter = newAdapter({ allowGatewayOverride: true });
      const legacySpy = jest
        .spyOn(adapter as any, "submitLegacyWithExplicitEndorsers")
        .mockResolvedValue(new TextEncoder().encode("ok"));
      const ctx = createContext();
      ctx.accumulate({ legacy: true });

      await adapter.submitTransaction(ctx, "create", [
        { foo: "bar" },
        42,
        "already-string",
      ]);

      const calledArgs = legacySpy.mock.calls[0][2]; // args parameter
      expect(calledArgs).toEqual([
        JSON.stringify({ foo: "bar" }),
        JSON.stringify(42),
        "already-string",
      ]);
    });

    it("converts transient data to Buffer for legacy flow", async () => {
      const adapter = newAdapter({ allowGatewayOverride: true });
      const legacySpy = jest
        .spyOn(adapter as any, "submitLegacyWithExplicitEndorsers")
        .mockResolvedValue(new TextEncoder().encode("ok"));
      const ctx = createContext();
      ctx.accumulate({ legacy: true });

      await adapter.submitTransaction(ctx, "create", [], {
        secret: "value",
      });

      const calledTransient = legacySpy.mock.calls[0][3]; // transientMap
      expect(calledTransient).toBeDefined();
      expect(Buffer.isBuffer(calledTransient.secret)).toBe(true);
      expect(calledTransient.secret.toString()).toBe(
        JSON.stringify("value")
      );
    });

    it("passes peer config from adapter config", async () => {
      const adapter = newAdapter({ allowGatewayOverride: true });
      const legacySpy = jest
        .spyOn(adapter as any, "submitLegacyWithExplicitEndorsers")
        .mockResolvedValue(new TextEncoder().encode("ok"));
      const ctx = createContext();
      ctx.accumulate({ legacy: true });

    await adapter.submitTransaction(ctx, "create");

    const calledPeerConfigs = legacySpy.mock.calls[0][4];
    expect(calledPeerConfigs).toEqual([
      {
        mspId: config.mspId,
        peerEndpoint: config.peerEndpoint,
        peerHostAlias: config.peerHostAlias,
        tlsCert: config.tlsCert,
      },
    ]);
  });

    it("builds a manual connection profile using provided peers", async () => {
      const adapter = newAdapter({ allowGatewayOverride: true });
      const ctx = createContext();
      ctx.accumulate({ legacy: true });

      await adapter.submitTransaction(ctx, "create", ["payload"]);

      expect(legacyGatewayConnectMock).toHaveBeenCalledTimes(1);
      const [profile] = legacyGatewayConnectMock.mock.calls[0];
      expect(profile).toBeDefined();
      expect(Object.keys(profile.peers || {})).toHaveLength(1);
      const peerName = Object.keys(profile.peers || {})[0];
      expect(peerName).toContain(config.mspId);
      expect(profile.channels[config.channel]).toBeDefined();
    });

    it("builds connection profile including mapped mirror peers", async () => {
      const adapter = newAdapter({ allowGatewayOverride: true });
      const ctx = createContext();
      const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0);
      ctx.accumulate({
        legacy: true,
        endorsingOrgs: [config.mspId, MIRROR_MSP],
      });

      await adapter.submitTransaction(ctx, "create", ["payload"]);

      const [profile] =
        legacyGatewayConnectMock.mock.calls[
          legacyGatewayConnectMock.mock.calls.length - 1
        ];
      expect(Object.keys(profile.peers || {})).toHaveLength(2);
      const tlsValues = Object.values(profile.peers || {}).map(
        (entry: any) => entry.tlsCACerts.pem
      );
      expect(tlsValues).toContain(mockCertPem);
      randomSpy.mockRestore();
    });
  });

  describe("allowGatewayOverride hydration", () => {
    const buildSerializer = () => ({
      serialize: jest.fn((payload: any) => JSON.stringify(payload)),
      deserialize: jest.fn((val: any) =>
        JSON.parse(
          typeof val === "string" ? val : new TextDecoder().decode(val)
        )
      ),
    });

    it("forces create to refresh after write even without transient data", async () => {
      const adapter = newAdapter({ allowGatewayOverride: true });
      (adapter as any).serializer = buildSerializer();
      const ctx = createContext();
      jest
        .spyOn(adapter as any, "submitTransaction")
        .mockResolvedValue(
          new TextEncoder().encode(
            JSON.stringify({ id: "wallet-1", token: "TK", balance: 5 })
          )
        );
      const readSpy = jest
        .spyOn(adapter, "read")
        .mockResolvedValue(
          { id: "wallet-1", token: "TK", balance: 25 } as any
        );
      const refreshSpy = jest.spyOn(
        adapter as any,
        "shouldRefreshAfterWrite"
      );

      const result = await adapter.create(
        ERC20Wallet,
        "wallet-1",
        new ERC20Wallet({ id: "wallet-1", token: "TK", balance: 5 }),
        {},
        ctx
      );

      expect(refreshSpy).toHaveBeenCalledWith(
        ERC20Wallet,
        ctx,
        true,
        "wallet-1"
      );
      expect(readSpy).toHaveBeenCalledWith(ERC20Wallet, "wallet-1", ctx);
      expect(result).toEqual({
        id: "wallet-1",
        token: "TK",
        balance: 25,
      });
    });

    it("forces createAll to refresh after write even without transient data", async () => {
      const adapter = newAdapter({ allowGatewayOverride: true });
      (adapter as any).serializer = buildSerializer();
      const ctx = createContext();
      jest
        .spyOn(adapter as any, "submitTransaction")
        .mockResolvedValue(
          new TextEncoder().encode(
            JSON.stringify([
              JSON.stringify({ id: "wallet-1", token: "TK", balance: 5 }),
              JSON.stringify({ id: "wallet-2", token: "TK", balance: 15 }),
            ])
          )
        );
      const readAllSpy = jest
        .spyOn(adapter, "readAll")
        .mockResolvedValue([
          { id: "wallet-1", token: "TK", balance: 50 },
          { id: "wallet-2", token: "TK", balance: 75 },
        ] as any);
      const refreshSpy = jest.spyOn(
        adapter as any,
        "shouldRefreshAfterWrite"
      );

      const result = await adapter.createAll(
        ERC20Wallet,
        ["wallet-1", "wallet-2"],
        [
          new ERC20Wallet({ id: "wallet-1", token: "TK", balance: 5 }),
          new ERC20Wallet({ id: "wallet-2", token: "TK", balance: 15 }),
        ],
        {},
        ctx
      );

      expect(refreshSpy).toHaveBeenCalledWith(
        ERC20Wallet,
        ctx,
        true,
        "wallet-1"
      );
      expect(readAllSpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual([
        { id: "wallet-1", token: "TK", balance: 50 },
        { id: "wallet-2", token: "TK", balance: 75 },
      ]);
    });

    it("forces delete to read before submitting when allowGatewayOverride is true", async () => {
      const adapter = newAdapter({ allowGatewayOverride: true });
      (adapter as any).serializer = buildSerializer();
      const ctx = createContext();
      jest
        .spyOn(adapter as any, "submitTransaction")
        .mockResolvedValue(new TextEncoder().encode("{}"));
      const readSpy = jest
        .spyOn(adapter, "read")
        .mockResolvedValue(
          { id: "wallet-1", token: "TK", balance: 5 } as any
        );
      const refreshSpy = jest.spyOn(
        adapter as any,
        "shouldRefreshAfterWrite"
      );

      const result = await adapter.delete(ERC20Wallet, "wallet-1", ctx);

      expect(refreshSpy).toHaveBeenCalledWith(
        ERC20Wallet,
        ctx,
        true,
        "wallet-1"
      );
      expect(readSpy).toHaveBeenCalledWith(ERC20Wallet, "wallet-1", ctx);
      expect(result).toEqual({ id: "wallet-1", token: "TK", balance: 5 });
    });

    it("forces deleteAll to read before submitting when allowGatewayOverride is true", async () => {
      const adapter = newAdapter({ allowGatewayOverride: true });
      (adapter as any).serializer = buildSerializer();
      const ctx = createContext();
      jest
        .spyOn(adapter as any, "submitTransaction")
        .mockResolvedValue(
          new TextEncoder().encode(
            JSON.stringify([JSON.stringify({ id: "wallet-1" })])
          )
        );
      const readAllSpy = jest
        .spyOn(adapter, "readAll")
        .mockResolvedValue([
          { id: "wallet-1", token: "TK", balance: 90 },
        ] as any);
      const refreshSpy = jest.spyOn(
        adapter as any,
        "shouldRefreshAfterWrite"
      );

      const result = await adapter.deleteAll(
        ERC20Wallet,
        ["wallet-1"],
        ctx
      );

      expect(refreshSpy).toHaveBeenCalledWith(
        ERC20Wallet,
        ctx,
        true,
        "wallet-1"
      );
      expect(readAllSpy).toHaveBeenCalledWith(
        ERC20Wallet,
        ["wallet-1"],
        ctx
      );
      expect(result).toEqual([{ id: "wallet-1", token: "TK", balance: 90 }]);
    });
  });

  describe("Query operations", () => {
    it("raw returns parsed documents when docsOnly is true", async () => {
      const adapter = newAdapter();
      const ctx = createContext();
      const docs = [
        { id: "q-1", token: "TK", balance: 10 },
        { id: "q-2", token: "TK", balance: 20 },
      ];
      jest
        .spyOn(adapter as any, "evaluateTransaction")
        .mockResolvedValue(
          new TextEncoder().encode(JSON.stringify(docs))
        );

      const result = await adapter.raw(
        { selector: { token: "TK" } },
        true,
        ERC20Wallet,
        ctx
      );

      expect(result).toEqual(docs);
    });

    it("raw returns full response when docsOnly is false", async () => {
      const adapter = newAdapter();
      const ctx = createContext();
      const response = {
        docs: [{ id: "q-1", token: "TK" }],
        bookmark: "page-2",
      };
      jest
        .spyOn(adapter as any, "evaluateTransaction")
        .mockResolvedValue(
          new TextEncoder().encode(JSON.stringify(response))
        );

      const result = await adapter.raw(
        { selector: { token: "TK" } },
        false,
        ERC20Wallet,
        ctx
      );

      expect(result).toEqual(response);
    });
  });
});
