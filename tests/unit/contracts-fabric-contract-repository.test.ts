import "reflect-metadata";

import { model, Model } from "@decaf-ts/decorator-validation";
import { pk } from "@decaf-ts/core";
import { FabricContractRepository } from "../../src/contracts/FabricContractRepository";
import { FabricContractAdapter } from "../../src/contracts/ContractAdapter";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { Repository } from "@decaf-ts/core";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import { FabricContractRepositoryObservableHandler } from "../../src/contracts/FabricContractRepositoryObservableHandler";

@model()
class RepoTestModel extends Model {
  @pk()
  id!: string;
}

describe("FabricContractRepository", () => {
  const context = new FabricContractContext();

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

    await repo.updateObservers("repo-test", OperationKeys.CREATE, "id-1", context);

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

    await repo.updateObservers("repo-test", OperationKeys.CREATE, "id-1", context);

    expect(superSpy).not.toHaveBeenCalled();
  });
});
