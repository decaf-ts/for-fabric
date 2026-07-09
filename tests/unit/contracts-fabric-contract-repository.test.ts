import "reflect-metadata";

import { model, Model, type ModelArg } from "@decaf-ts/decorator-validation";
import { defaultQueryAttr, pk } from "@decaf-ts/core";
import { table } from "@decaf-ts/core";
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

@model()
class MultiDefaultQueryModel extends Model {
  @pk()
  id!: string;

  @defaultQueryAttr()
  model!: string;

  @defaultQueryAttr()
  recordId!: string;

  constructor(args?: ModelArg<MultiDefaultQueryModel>) {
    super(args);
  }
}

@table("range_pagination")
@model()
class RangePaginationModel extends Model {
  @pk()
  id!: string;

  constructor(args?: ModelArg<RangePaginationModel>) {
    super(args);
  }
}

function decodeDefaultQueryBookmark(bookmark: string) {
  const prefix = "__dcf_dqbm__";
  if (!bookmark.startsWith(prefix)) return undefined;
  return JSON.parse(
    Buffer.from(bookmark.slice(prefix.length), "base64url").toString("utf8")
  );
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

  it("delegates updateObservers when event is not omitted", async () => {
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

    expect(superSpy).toHaveBeenCalledWith(
      "repo-test",
      OperationKeys.CREATE,
      "id-1",
      context
    );
  });

  it("skips updateObservers when event is omitted", async () => {
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

  it("listBy uses execute directly instead of paginating", async () => {
    const repo = new FabricContractRepository<RepoTestModel>(
      createAdapter(),
      RepoTestModel
    );
    const selectSpy = jest.spyOn(repo, "select");
    const execute = jest.fn().mockResolvedValue([{ id: "id-1" }]);
    const paginate = jest.fn();
    const orderBy = jest.fn().mockReturnValue({
      execute,
      paginate,
    });
    selectSpy.mockReturnValue({
      orderBy,
    } as any);

    const context = createFabricContext();
    const results = await repo.listBy("id", OrderDirection.ASC, context);

    expect(results).toEqual([{ id: "id-1" }]);
    expect(orderBy).toHaveBeenCalledWith(["id", OrderDirection.ASC]);
    expect(execute).toHaveBeenCalledWith(context);
    expect(paginate).not.toHaveBeenCalled();
  });

  it("finds across default query attributes without forcing a single index", async () => {
    const repo = new FabricContractRepository<MultiDefaultQueryModel>(
      createAdapter(),
      MultiDefaultQueryModel
    );
    const selectSpy = jest.spyOn(repo, "select");
    const chainA = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue([]),
    };
    const chainB = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue([
        new MultiDefaultQueryModel({
          id: "id-1",
          model: "Product",
          recordId: "12345",
        }),
      ]),
    };
    selectSpy
      .mockReturnValueOnce(chainA as any)
      .mockReturnValueOnce(chainB as any);

    const context = createFabricContext();
    const results = await repo.find("123", OrderDirection.ASC, context);

    expect(results).toHaveLength(1);
    expect(chainA.orderBy).toHaveBeenCalledWith(["model", OrderDirection.ASC]);
    expect(chainB.orderBy).toHaveBeenCalledWith(["recordId", OrderDirection.ASC]);
  });

  it("pages across default query attributes using the matching attribute bookmark", async () => {
    const repo = new FabricContractRepository<MultiDefaultQueryModel>(
      createAdapter(),
      MultiDefaultQueryModel
    );
    const selectSpy = jest.spyOn(repo, "select");
    const paginatorA = {
      page: jest.fn().mockResolvedValue([]),
      serialize: jest.fn().mockReturnValue({
        current: 1,
        total: 1,
        count: 0,
        data: [],
        bookmark: undefined,
      }),
    };
    const paginatorB = {
      page: jest.fn().mockResolvedValue([
        new MultiDefaultQueryModel({
          id: "id-2",
          model: "Product",
          recordId: "abc-2",
        }),
      ]),
      serialize: jest.fn().mockReturnValue({
        current: 1,
        total: 2,
        count: 1,
        data: [
          new MultiDefaultQueryModel({
            id: "id-2",
            model: "Product",
            recordId: "abc-2",
          }),
        ],
        bookmark: "inner-bookmark",
      }),
    };
    const chainA = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      paginate: jest.fn().mockReturnValue(paginatorA),
    };
    const chainB = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      paginate: jest.fn().mockReturnValue(paginatorB),
    };
    selectSpy
      .mockReturnValueOnce(chainA as any)
      .mockReturnValueOnce(chainB as any);

    const context = createFabricContext();
    const page = await repo.page("abc", OrderDirection.ASC, { limit: 1, offset: 1 }, context);

    expect(page.data).toHaveLength(1);
    expect(page.bookmark).toBeDefined();
    expect(decodeDefaultQueryBookmark(page.bookmark as string)).toEqual(
      expect.objectContaining({
        attr: "recordId",
        bookmark: "inner-bookmark",
      })
    );
    expect(chainA.orderBy).toHaveBeenCalledWith(["model", OrderDirection.ASC]);
    expect(chainB.orderBy).toHaveBeenCalledWith(["recordId", OrderDirection.ASC]);
  });

  it("delegates pk-ordered pagination to the adapter when enabled", async () => {
    const repo = new FabricContractRepository<RangePaginationModel>(
      createAdapter(),
      RangePaginationModel
    );
    const ctx = createFabricContext();
    ctx.put("pkRangePagination", true);
    const rangeSpy = jest
      .spyOn(repo.adapter as FabricContractAdapter, "paginateByPrimaryKeyRange")
      .mockResolvedValue({
        current: 1,
        total: 2,
        count: 2,
        data: [],
        bookmark: "next-bookmark",
      } as any);

    const firstPage = await repo.paginateBy(
      "id",
      OrderDirection.ASC,
      { limit: 2, offset: 1 },
      ctx
    );

    expect(rangeSpy).toHaveBeenCalled();
    expect(rangeSpy).toHaveBeenCalledWith(
      RangePaginationModel,
      OrderDirection.ASC,
      { limit: 2, offset: 1 },
      ctx
    );
    expect(firstPage).toEqual({
      current: 1,
      total: 2,
      count: 2,
      data: [],
      bookmark: "next-bookmark",
    });
  });

  it("delegates pk-ordered pagination in descending order when enabled", async () => {
    const repo = new FabricContractRepository<RangePaginationModel>(
      createAdapter(),
      RangePaginationModel
    );
    const ctx = createFabricContext();
    ctx.put("pkRangePagination", true);
    const rangeSpy = jest
      .spyOn(repo.adapter as FabricContractAdapter, "paginateByPrimaryKeyRange")
      .mockResolvedValue({
        current: 1,
        total: 2,
        count: 2,
        data: [],
        bookmark: "prev-bookmark",
      } as any);

    const page = await repo.paginateBy(
      "id",
      OrderDirection.DSC,
      { limit: 2, offset: 1 },
      ctx
    );

    expect(rangeSpy).toHaveBeenCalledWith(
      RangePaginationModel,
      OrderDirection.DSC,
      { limit: 2, offset: 1 },
      ctx
    );
    expect(page.bookmark).toBe("prev-bookmark");
  });

  it("keeps the default mango pagination path when pk-range optimization is disabled", async () => {
    const repo = new FabricContractRepository<RangePaginationModel>(
      createAdapter(),
      RangePaginationModel
    );
    const selectSpy = jest.spyOn(repo, "select");
    const rangeSpy = jest.spyOn(
      repo.adapter as FabricContractAdapter,
      "paginateByPrimaryKeyRange"
    );
    const paginator = {
      page: jest.fn().mockResolvedValue([]),
      serialize: jest.fn().mockReturnValue({
        current: 1,
        total: 1,
        count: 0,
        data: [],
        bookmark: undefined,
      }),
    };
    selectSpy.mockReturnValue({
      orderBy: jest.fn().mockReturnValue({
        paginate: jest.fn().mockReturnValue(paginator),
      }),
    } as any);
    const ctx = createFabricContext();

    await repo.paginateBy(
      "id",
      OrderDirection.ASC,
      { limit: 1, offset: 1 },
      ctx
    );

    expect(selectSpy).toHaveBeenCalled();
    expect(rangeSpy).not.toHaveBeenCalled();
  });
});
