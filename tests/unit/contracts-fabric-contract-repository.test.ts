import "reflect-metadata";

import { model, Model, type ModelArg } from "@decaf-ts/decorator-validation";
import { pk } from "@decaf-ts/core";
import { FabricContractRepository } from "../../src/contracts/FabricContractRepository";
import { FabricContractAdapter } from "../../src/contracts/ContractAdapter";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { OrderDirection } from "@decaf-ts/core";
import { Repository } from "@decaf-ts/core";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import { FabricContractRepositoryObservableHandler } from "../../src/contracts/FabricContractRepositoryObservableHandler";

@model()
class RepoTestModel extends Model {
  @pk()
  id!: string;

  constructor(args?: ModelArg<RepoTestModel>) {
    super(args);
  }
}

const createFabricContext = () => {
  const ctx = new FabricContractContext();
  ctx.put("stub", {
    getDateTimestamp: () => new Date(),
    getTxID: () => "tx",
    getChannelId: () => "channel",
  } as any);
  ctx.put(
    "identity",
    {
      getID: () => "test-identity",
      getMSPID: () => "org1",
      getAttributeValue: (_key: string) => "roles",
      getIDBytes: () => Buffer.from("identity"),
    } as any
  );
  return ctx;
};

describe("FabricContractRepository", () => {

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createAdapter = () =>
    new FabricContractAdapter(undefined as any, `test-alias-${Math.random()}`);

  it("returns FabricContractRepositoryObservableHandler from ObserverHandler()", () => {
    const repo = new FabricContractRepository<RepoTestModel>(
      createAdapter(),
      RepoTestModel
    );
    const handler = repo.ObserverHandler();
    expect(handler).toBeInstanceOf(FabricContractRepositoryObservableHandler);
  });

  it("delegates updateObservers when event tracked", async () => {
    const repo = new FabricContractRepository<RepoTestModel>(
      createAdapter(),
      RepoTestModel,
      [OperationKeys.CREATE]
    );
    const superSpy = jest
      .spyOn(Repository.prototype, "updateObservers")
      .mockResolvedValue();

    const context = createFabricContext();
    await repo.updateObservers(
      "repo-test",
      OperationKeys.CREATE,
      "id-1",
      context
    );

    expect(superSpy).toHaveBeenCalledWith(
      "repo-test",
      OperationKeys.CREATE,
      "id-1",
      context
    );
  });

  it("skips updateObservers when event not tracked", async () => {
    const repo = new FabricContractRepository<RepoTestModel>(
      createAdapter(),
      RepoTestModel,
      [OperationKeys.DELETE]
    );
    const superSpy = jest
      .spyOn(Repository.prototype, "updateObservers")
      .mockResolvedValue();

    const context = createFabricContext();
    await repo.updateObservers(
      "repo-test",
      OperationKeys.CREATE,
      "id-1",
      context
    );

    expect(superSpy).not.toHaveBeenCalled();
  });

  it("routes find statements to the method implementation", async () => {
    const repo = new FabricContractRepository<RepoTestModel>(
      createAdapter(),
      RepoTestModel
    );
    const findSpy = jest
      .spyOn(repo, "find")
      .mockResolvedValue([{ id: "found" }] as any);
    const context = createFabricContext();
    const result = await repo.statement(
      "find",
      "term",
      OrderDirection.ASC,
      context
    );
    expect(findSpy).toHaveBeenCalledWith("term", OrderDirection.ASC, context);
    expect(result).toEqual([{ id: "found" }]);
  });

  it("routes page statements to the method implementation", async () => {
    const repo = new FabricContractRepository<RepoTestModel>(
      createAdapter(),
      RepoTestModel
    );
    const pageSpy = jest
      .spyOn(repo, "page")
      .mockResolvedValue({ data: [] } as any);
    const ref = { offset: 2, limit: 2 };
    const context = createFabricContext();
    await repo.statement("page", "term", OrderDirection.DSC, ref, context);
    expect(pageSpy).toHaveBeenCalledWith(
      "term",
      OrderDirection.DSC,
      ref,
      context
    );
  });
});
