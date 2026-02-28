import "reflect-metadata";

import { Context } from "@decaf-ts/core";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";

const createConfig = () => ({
  cryptoPath: "",
  keyCertOrDirectoryPath: "key",
  certCertOrDirectoryPath: "cert",
  tlsCert: "tls",
  peerEndpoint: "localhost:7051",
  peerHostAlias: "peer",
  chaincodeName: "testcc",
  mspId: "Org1MSP",
  channel: "testChannel",
  evaluateTimeout: 1000,
  endorseTimeout: 1000,
  submitTimeout: 1000,
  commitTimeout: 1000,
});

const createLogger = () => ({
  for: jest.fn().mockReturnThis(),
  clear: jest.fn().mockReturnThis(),
  info: jest.fn(),
  error: jest.fn(),
  verbose: jest.fn(),
  debug: jest.fn(),
});

describe("FabricClientAdapter observables", () => {
  it("forwards refresh calls to the observer handler", async () => {
    const adapter = new FabricClientAdapter(createConfig() as any, "adapter-id");
    const handler = { updateObservers: jest.fn() } as any;
    Object.defineProperty(adapter, "observerHandler", {
      value: handler,
      writable: true,
    });

    const ctx = new Context();
    ctx.accumulate({
      logger: createLogger(),
      noEmit: false,
      noEmitSingle: false,
      noEmitBulk: false,
    } as any);

    await adapter.refresh("TestModel", OperationKeys.UPDATE, "identity-1", ctx);

    expect(handler.updateObservers).toHaveBeenCalledWith(
      "TestModel",
      OperationKeys.UPDATE,
      "identity-1",
      ctx
    );
  });
});
