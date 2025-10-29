import "reflect-metadata";

import { InternalError, BulkCrudOperationKeys } from "@decaf-ts/db-decorators";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { FabricClientRepository } from "../../src/client/FabricClientRepository";
import type { PeerConfig } from "../../src/shared/types";

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

describe("FabricClientAdapter", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const newAdapter = () =>
    new FabricClientAdapter(
      config,
      `adapter-${Math.random().toString(36).slice(2)}`
    );

  it("decodes Uint8Array payloads", () => {
    const adapter = newAdapter();
    expect(
      adapter.decode(new TextEncoder().encode("fabric-value"))
    ).toBe("fabric-value");
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
    const submitSpy = jest
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
    const [operation, payload] = submitSpy.mock.calls[0];
    expect(operation).toBe(BulkCrudOperationKeys.CREATE_ALL);
    expect(payload).toEqual([
      ["wallet-1"],
      [expect.stringContaining('"id":"wallet-1"')],
    ]);
  });
});
