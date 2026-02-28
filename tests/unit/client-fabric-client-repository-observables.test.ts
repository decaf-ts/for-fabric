import "reflect-metadata";

import { Context } from "@decaf-ts/core";
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

  const createHandler = () => ({
    updateObservers: jest.fn(),
    count: jest.fn().mockReturnValue(0),
  });

  const createLogger = () => ({
    for: jest.fn().mockReturnThis(),
    clear: jest.fn().mockReturnThis(),
    info: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
  });

  it("forwards events when not omitted", async () => {
    const adapter = createAdapter();
    const repo = new FabricClientRepository(adapter, Wallet);
    const handler = createHandler() as any;
    Object.defineProperty(repo, "observerHandler", {
      value: handler,
      writable: true,
    });

    const ctx = new Context();
    ctx.accumulate({ logger: createLogger() } as any);

    await repo.updateObservers("wallets", OperationKeys.CREATE, "w-1", ctx);

    expect(handler.updateObservers).toHaveBeenCalledWith(
      "wallets",
      OperationKeys.CREATE,
      "w-1",
      ctx
    );
  });
});
