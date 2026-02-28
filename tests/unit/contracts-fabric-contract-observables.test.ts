import "reflect-metadata";

import { FabricContractAdapter } from "../../src/contracts/ContractAdapter";
import { FabricContractRepositoryObservableHandler } from "../../src/contracts/FabricContractRepositoryObservableHandler";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import { getIdentityMock, getStubMock } from "./ContextMock";
import { OperationKeys } from "@decaf-ts/db-decorators";

const createLogger = () => ({
  for: jest.fn().mockReturnThis(),
  clear: jest.fn().mockReturnThis(),
  info: jest.fn(),
  error: jest.fn(),
  verbose: jest.fn(),
  debug: jest.fn(),
});

const createAdapter = () =>
  new FabricContractAdapter(undefined as any, `adapter-${Math.random().toString(36).slice(2)}`);

describe("FabricContractAdapter observables", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("emits events through the stub when observation is enabled", async () => {
    const adapter = createAdapter();
    const handler = new FabricContractRepositoryObservableHandler();
    Object.defineProperty(adapter, "observerHandler", {
      value: handler,
      writable: true,
    });

    const stub = getStubMock();
    const identity = getIdentityMock();
    const logger = createLogger();
    stub.setEvent = jest.fn(stub.setEvent);

    const ctx = new FabricContractContext();
    ctx.accumulate({ stub, identity, logger } as any);
    ctx.put("observeFullResult", true);

    await adapter.updateObservers(
      "TestModel",
      OperationKeys.CREATE,
      "evt-1",
      "owner-1",
      { value: 1 },
      ctx
    );

    expect(stub.setEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer)
    );
    const payload = JSON.parse(
      stub.setEvent.mock.calls[0][1].toString("utf8")
    );
    expect(payload).toEqual({ id: "evt-1", result: { value: 1 } });
  });

  it("does not emit when noEmitSingle is set", async () => {
    const adapter = createAdapter();
    const handler = new FabricContractRepositoryObservableHandler();
    Object.defineProperty(adapter, "observerHandler", {
      value: handler,
      writable: true,
    });

    const stub = getStubMock();
    const identity = getIdentityMock();
    const logger = createLogger();
    stub.setEvent = jest.fn(stub.setEvent);

    const ctx = new FabricContractContext();
    ctx.accumulate({ stub, identity, logger } as any);
    ctx.put("noEmitSingle", true);

    await adapter.updateObservers(
      "TestModel",
      OperationKeys.CREATE,
      "evt-2",
      "owner-2",
      undefined,
      ctx
    );

    expect(stub.setEvent).not.toHaveBeenCalled();
  });
});
