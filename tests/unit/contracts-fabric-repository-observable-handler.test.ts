import "reflect-metadata";

import { OperationKeys, BulkCrudOperationKeys } from "@decaf-ts/db-decorators";
import { FabricContractRepositoryObservableHandler } from "../../src/contracts/FabricContractRepositoryObservableHandler";
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
    const ctx = { stub } as any;
    const log = { debug: jest.fn() } as any;

    await handler.updateObservers(
      log,
      "assets",
      OperationKeys.CREATE,
      "id-1",
      ctx,
      "owner1"
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
    const ctx = { stub } as any;
    const log = { debug: jest.fn() } as any;

    await handler.updateObservers(
      log,
      "assets",
      BulkCrudOperationKeys.DELETE_ALL,
      "batch-1",
      ctx,
      undefined,
      { hello: "world" }
    );

    expect(generateFabricEventName).not.toHaveBeenCalled();
    expect(stub.setEvent).toHaveBeenCalledWith(
      BulkCrudOperationKeys.DELETE_ALL,
      Buffer.from(JSON.stringify({ hello: "world" }))
    );
  });
});
