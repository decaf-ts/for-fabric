import "reflect-metadata";
import "../../src/shared/overrides";

import { getMockCtx, getStubMock } from "./ContextMock";
import { TestPublicModelContract } from "../assets/contract/serialized-contract-public-model/TestPublicModelContract";
import { TestPublicModel } from "../assets/contract/serialized-contract-public-model/TestPublicModel";
import { FabricContractRepository } from "../../src/contracts/FabricContractRepository";
import { Model } from "@decaf-ts/decorator-validation";
import { OperationKeys } from "@decaf-ts/db-decorators";

jest.setTimeout(10000);

describe("FabricContractAdapter observable pipeline", () => {
  let ctx: ReturnType<typeof getMockCtx>;
  let stub: ReturnType<typeof getStubMock>;
  let contract: TestPublicModelContract;
  let repo: FabricContractRepository<TestPublicModel>;

  beforeAll(async () => {
    ctx = getMockCtx();
    stub = ctx.stub as ReturnType<typeof getStubMock>;
    contract = new TestPublicModelContract();
    repo = (contract as any).repo as FabricContractRepository<TestPublicModel>;
    // Wait for async dispatch.initialize() to complete and set up proxy wrappers
    await new Promise((r) => setTimeout(r, 100));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("calls updateObservers on the contract repo after create", async () => {
    const updateObserversSpy = jest.spyOn(repo, "updateObservers");

    const model = new TestPublicModel({
      name: "Alice",
      nif: "123456789",
      child: { name: "Child" },
    });
    await contract.create(ctx as any, model.serialize());

    // updateObservers is called with (table, event, id, mspId, payload?, ctx)
    expect(updateObserversSpy).toHaveBeenCalledWith(
      expect.anything(), // table (Constructor or string)
      OperationKeys.CREATE,
      expect.anything(), // id
      expect.anything(), // mspId (from stub.getMspID)
      expect.anything(), // payload (result, may be undefined)
      expect.anything() // ctx
    );
  });

  it("emits a Fabric event via stub.setEvent after create", async () => {
    const setEventSpy = jest.spyOn(stub, "setEvent");

    const model = new TestPublicModel({
      name: "Bob",
      nif: "987654321",
      child: { name: "Child2" },
    });
    await contract.create(ctx as any, model.serialize());

    expect(setEventSpy).toHaveBeenCalledTimes(1);
    const [eventName, payload] = setEventSpy.mock.calls[0];
    expect(typeof eventName).toBe("string");
    const parsed = JSON.parse(payload.toString("utf8"));
    // Contract events must contain at least an id
    expect(parsed).toHaveProperty("id");
    // Result may be included (observeFullResult=true by default).
    // When present, it must be only public data — no private collection keys.
    if (parsed.result !== undefined) {
      expect(parsed.result).not.toHaveProperty("__privateCollection");
    }
  });
});
