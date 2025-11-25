import "reflect-metadata";

import { InternalError } from "@decaf-ts/db-decorators";
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

const attachLoggerSpies = (adapter: FabricClientAdapter) => {
  const log = (adapter as any).log;
  const stub = {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    silly: jest.fn(),
  };
  jest.spyOn(log, "for").mockReturnValue(stub);
  ["info", "debug", "error", "verbose", "silly"].forEach((method) => {
    if (typeof log[method] === "function") {
      jest.spyOn(log, method).mockImplementation(() => undefined);
    }
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
    await expect(
      adapter.createAll("erc20_wallets", ["wallet-1"], [], {})
    ).rejects.toThrow(InternalError);
  });

  it("parses createAll results", async () => {
    const adapter = newAdapter();
    jest
      .spyOn(adapter as any, "submitTransaction")
      .mockResolvedValue(
        new TextEncoder().encode(
          JSON.stringify([JSON.stringify({ id: "wallet-1", balance: 33 })])
        )
      );

    const result = await adapter.createAll(
      "erc20_wallets",
      ["wallet-1"],
      [{ id: "wallet-1", balance: 33 }],
      {}
    );

    expect(result).toEqual([{ id: "wallet-1", balance: 33 }]);
  });

  it("wraps raw evaluation errors with parseError", async () => {
    const adapter = newAdapter();
    jest
      .spyOn(adapter as any, "evaluateTransaction")
      .mockRejectedValue(new Error("boom"));
    jest
      .spyOn(FabricClientAdapter as unknown as any, "parseError")
      .mockReturnValue(new Error("parsed"));

    await expect(adapter.raw({ selector: {} }, true)).rejects.toThrow("parsed");
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
});
