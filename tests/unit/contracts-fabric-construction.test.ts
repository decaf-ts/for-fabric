import "reflect-metadata";

import {
  oneToOneOnCreate,
  oneToOneOnUpdate,
  oneToManyOnCreateUpdate,
  oneToManyOnDelete,
  populate,
  Cascade,
  Repository,
  pk,
} from "@decaf-ts/core";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import { Model, model, list } from "@decaf-ts/decorator-validation";
import { prop } from "@decaf-ts/decoration";

@model()
class ChildModel extends Model {
  @pk()
  id?: string;

  constructor(data?: Partial<ChildModel>) {
    super(data);
  }
}

@model()
class ParentModel extends Model {
  @prop()
  child?: string | ChildModel;

  @list(ChildModel)
  @prop()
  items?: Array<string | ChildModel>;

  constructor(data?: Partial<ParentModel>) {
    super(data);
  }
}

function createMockRepo(overrides: Record<string, jest.Mock> = {}) {
  const repo: any = {
    read: jest.fn(),
    delete: jest.fn(),
    deleteAll: jest.fn(),
    override: jest.fn(),
    pk: "id",
    class: ChildModel,
    adapter: { alias: "test-alias" },
    _overrides: {},
    ...overrides,
  };
  repo.override.mockReturnValue(repo);
  return repo;
}

function createLogger() {
  const logger: any = {
    info: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    silly: jest.fn(),
    for: jest.fn(),
    clear: jest.fn().mockReturnThis(),
  };
  logger.for.mockReturnValue(logger);
  return logger;
}

describe("Construction relationship hooks", () => {
  let forModelSpy: jest.SpyInstance;

  afterEach(() => {
    forModelSpy?.mockRestore();
    jest.restoreAllMocks();
  });

  it("oneToOneOnCreate loads and caches reference ids", async () => {
    const repo = createMockRepo({
      read: jest.fn().mockResolvedValue(new ChildModel({ id: "c-1" })),
    });
    forModelSpy = jest
      .spyOn(Repository, "forModel")
      .mockImplementation((model: any) => {
        repo.class = model;
        return repo as any;
      });

    const context = new FabricContractContext();
    context.accumulate({ logger: createLogger(), cacheForPopulate: {} } as any);

    const model = new ParentModel({ child: "c-1" });

    await oneToOneOnCreate.call(
      { adapter: { alias: "test-alias" }, _overrides: {} },
      context,
      {
        cascade: { delete: Cascade.NONE, update: Cascade.NONE },
        class: ChildModel,
      } as any,
      "child",
      model
    );

    expect(repo.read).toHaveBeenCalledWith("c-1", context);
    expect(model.child).toBe("c-1");
  });

  it("oneToOneOnUpdate skips when cascade update is NONE", async () => {
    const context = new FabricContractContext();
    context.accumulate({ logger: createLogger() } as any);

    const model = new ParentModel({ child: "c-1" });

    await oneToOneOnUpdate.call(
      { adapter: { alias: "test-alias" }, _overrides: {} },
      context,
      {
        cascade: { update: Cascade.NONE },
        class: ChildModel,
      } as any,
      "child",
      model
    );

    // Should return early without reading
    expect(model.child).toBe("c-1");
  });

  it("oneToManyOnCreateUpdate reads each item via repo", async () => {
    const childA = new ChildModel({ id: "a" });
    const childB = new ChildModel({ id: "b" });
    const repo = createMockRepo({
      read: jest
        .fn()
        .mockResolvedValueOnce(childA)
        .mockResolvedValueOnce(childB),
    });
    forModelSpy = jest
      .spyOn(Repository, "forModel")
      .mockImplementation((model: any) => {
        repo.class = model;
        return repo as any;
      });

    const context = new FabricContractContext();
    context.accumulate({ logger: createLogger(), cacheForPopulate: {} } as any);

    const model = new ParentModel({ items: ["a", "b"] });

    await oneToManyOnCreateUpdate.call(
      { adapter: { alias: "test-alias" }, _overrides: {} },
      context,
      {
        cascade: { update: Cascade.CASCADE },
        class: ChildModel,
      } as any,
      "items",
      model
    );

    expect(repo.read).toHaveBeenCalledTimes(2);
  });

  it("oneToManyOnDelete skips when cascade not enabled", async () => {
    const context = new FabricContractContext();
    context.accumulate({ logger: createLogger() } as any);

    const model = new ParentModel({ items: ["a", "b"] });

    const repo = createMockRepo();
    forModelSpy = jest
      .spyOn(Repository, "forModel")
      .mockImplementation((model: any) => {
        repo.class = model;
        return repo as any;
      });

    await oneToManyOnDelete.call(
      { adapter: { alias: "test-alias" }, _overrides: {} },
      context,
      {
        cascade: { delete: Cascade.NONE },
        class: ChildModel,
      } as any,
      "items",
      model
    );

    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("populate falls back to repo.read when cache is empty", async () => {
    const repo = createMockRepo({
      read: jest.fn().mockResolvedValue(new ChildModel({ id: "c-1" })),
    });
    forModelSpy = jest
      .spyOn(Repository, "forModel")
      .mockImplementation((model: any) => {
        repo.class = model;
        return repo as any;
      });

    const context = new FabricContractContext();
    context.accumulate({
      logger: createLogger(),
      cacheForPopulate: {},
    } as any);

    const model = new ParentModel({ child: "c-1" });

    await populate.call(
      { adapter: { alias: "test-alias" }, _overrides: {} },
      context,
      { populate: true, class: ChildModel } as any,
      "child",
      model
    );

    expect(repo.read).toHaveBeenCalledWith("c-1", context);
    expect(model.child).toBeInstanceOf(ChildModel);
  });
});
