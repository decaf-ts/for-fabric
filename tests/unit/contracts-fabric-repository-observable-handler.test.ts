import "reflect-metadata";

import { OperationKeys, BulkCrudOperationKeys } from "@decaf-ts/db-decorators";
import { FabricContractRepositoryObservableHandler } from "../../src/contracts/FabricContractRepositoryObservableHandler";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import { generateFabricEventName } from "../../src/shared/events";

jest.mock("../../src/shared/events", () => ({
  generateFabricEventName: jest.fn().mockReturnValue("assets.CREATE"),
}));

describe("FabricContractRepositoryObservableHandler", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("emits supported Fabric events with generated name", async () => {
    const handler = new FabricContractRepositoryObservableHandler();
    const stub = { setEvent: jest.fn() };
    const ctx = new FabricContractContext();
    const logger = {
      for: jest.fn().mockReturnThis(),
      clear: jest.fn().mockReturnThis(),
      info: jest.fn(),
      error: jest.fn(),
      verbose: jest.fn(),
      debug: jest.fn(),
    };
    ctx.accumulate({ stub, logger } as any);
    const log = { debug: jest.fn() } as any;

    await handler.updateObservers(
      "assets",
      OperationKeys.CREATE,
      "id-1",
      "owner1",
      ctx
    );

    expect(generateFabricEventName).toHaveBeenCalledWith(
      "assets",
      OperationKeys.CREATE,
      "owner1"
    );
    expect(stub.setEvent).toHaveBeenCalledWith(
      "assets.CREATE",
      expect.any(Buffer)
    );
    const payload = JSON.parse(stub.setEvent.mock.calls[0][1].toString());
    expect(payload).toEqual({ id: "id-1" });
  });

  it("passes through unsupported events untouched", async () => {
    const handler = new FabricContractRepositoryObservableHandler([
      OperationKeys.CREATE,
    ]);
    const stub = { setEvent: jest.fn() };
    const ctx = new FabricContractContext();
    const logger = {
      for: jest.fn().mockReturnThis(),
      clear: jest.fn().mockReturnThis(),
      info: jest.fn(),
      error: jest.fn(),
      verbose: jest.fn(),
      debug: jest.fn(),
    };
    ctx.accumulate({ stub, logger } as any);
    const log = { debug: jest.fn() } as any;

    await handler.updateObservers(
      "assets",
      BulkCrudOperationKeys.DELETE_ALL,
      "batch-1",
      undefined,
      { hello: "world" },
      ctx
    );

    expect(generateFabricEventName).not.toHaveBeenCalled();
    expect(stub.setEvent).toHaveBeenCalledWith(
      BulkCrudOperationKeys.DELETE_ALL,
      Buffer.from(JSON.stringify({ hello: "world" }))
    );
  });
});
