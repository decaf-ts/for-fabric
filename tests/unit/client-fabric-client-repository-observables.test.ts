import "reflect-metadata";

import { Context, Dispatch } from "@decaf-ts/core";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { pk } from "@decaf-ts/core";
import { model, Model } from "@decaf-ts/decorator-validation";
import { FabricClientRepository } from "../../src/client/FabricClientRepository";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";

@model()
class Wallet extends Model {
  @pk()
  id!: string;
}

describe("FabricClientRepository observables", () => {
  const createAdapter = () => {
    const id = Math.random().toString(36).slice(2);
    return new FabricClientAdapter(
      {
        cryptoPath: "/tmp",
        keyCertOrDirectoryPath: "/tmp/key",
        certCertOrDirectoryPath: "/tmp/cert",
        tlsCert: "tls",
        peerEndpoint: "peer:7051",
        peerHostAlias: "peer",
        chaincodeName: "testcc",
        mspId: "Org1MSP",
        channel: "testChannel",
        evaluateTimeout: 1000,
        endorseTimeout: 1000,
        submitTimeout: 1000,
        commitTimeout: 1000,
      } as any,
      `adapter-${id}`
    );
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("forwards events when not omitted", async () => {
    const adapter = createAdapter();
    const repo = new FabricClientRepository(adapter, Wallet);

    // Use base Dispatch (not FabricClientDispatch) so CRUD methods are proxied
    // locally without requiring a real Fabric network connection
    jest
      .spyOn(adapter, "Dispatch")
      .mockReturnValue(new Dispatch() as any);

    // Mock the Fabric-level adapter calls to avoid network I/O
    const wallet = new Wallet({ id: "w-1" });
    jest
      .spyOn(adapter, "create")
      .mockResolvedValue({ id: "w-1" } as any);
    jest
      .spyOn(adapter, "revert")
      .mockReturnValue(wallet as any);

    // Register a mock observer via the proper adapter.observe() API
    const mockObserver = {
      refresh: jest.fn().mockResolvedValue(undefined),
      toString: () => "MockObserver",
    };
    adapter.observe(mockObserver as any);

    // Wait for async dispatch.initialize() to wrap CRUD methods with proxies
    await new Promise((r) => setTimeout(r, 100));

    // Call the transactional method on the repository
    await repo.create(wallet);

    // Allow the fire-and-forget observer dispatch to settle
    await new Promise((r) => setTimeout(r, 50));

    // With observeFullResult=true (default), the Dispatch proxy includes the
    // result in observer notifications: (table, event, id, result, ctx)
    expect(mockObserver.refresh).toHaveBeenCalledWith(
      Wallet,
      OperationKeys.CREATE,
      "w-1",
      expect.anything(), // result payload (observeFullResult=true by default)
      expect.anything() // context
    );
  });
});
