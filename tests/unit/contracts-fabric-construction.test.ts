import "reflect-metadata";

jest.mock("@decaf-ts/core", () => {
  const actual = jest.requireActual("@decaf-ts/core");
  return {
    ...actual,
    repositoryFromTypeMetadata: jest.fn(),
    cacheModelForPopulate: jest.fn(),
    createOrUpdate: jest.fn(),
  };
});

import {
  oneToOneOnCreate,
  oneToOneOnUpdate,
  oneToManyOnCreate,
  oneToManyOnDelete,
  populate,
} from "../../src/contracts/FabricConstruction";
import {
  Cascade,
  repositoryFromTypeMetadata,
  cacheModelForPopulate,
} from "@decaf-ts/core";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import { Model, model, prop } from "@decaf-ts/decorator-validation";

@model()
class ParentModel extends Model {
  @prop()
  child?: string | ChildModel;

  @prop()
  items?: Array<string | ChildModel>;

  constructor(data?: Partial<ParentModel>) {
    super(data);
  }
}

@model()
class ChildModel extends Model {
  @prop()
  id?: string;

  constructor(data?: Partial<ChildModel>) {
    super(data);
  }
}

describe("FabricConstruction relationship hooks", () => {
  const context = new FabricContractContext();

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("oneToOneOnCreate loads and caches reference ids", async () => {
    const repo = { read: jest.fn().mockResolvedValue(new ChildModel({ id: "c-1" })) };
    (cacheModelForPopulate as jest.Mock).mockResolvedValue(undefined);
    (repositoryFromTypeMetadata as jest.Mock).mockReturnValue(repo);

    const model = new ParentModel({ child: "c-1" });

    await oneToOneOnCreate.call(
      { adapter: { alias: "alias" } },
      context,
      { cascade: { delete: Cascade.NONE, update: Cascade.NONE } } as any,
      "child",
      model
    );

    expect(repo.read).toHaveBeenCalledWith("c-1", context);
    expect(cacheModelForPopulate).toHaveBeenCalled();
    expect(model.child).toBe("c-1");
  });

  it("oneToOneOnUpdate respects cascade configuration", async () => {
    const model = new ParentModel({ child: "c-1" });
    const repo = { read: jest.fn() };
    (repositoryFromTypeMetadata as jest.Mock).mockReturnValue(repo);

    await oneToOneOnUpdate.call(
      { adapter: { alias: "alias" } },
      context,
      { cascade: { update: Cascade.NONE } } as any,
      "child",
      model
    );

    expect(repo.read).not.toHaveBeenCalled();
  });

  it("oneToManyOnCreate throws when items types differ", async () => {
    const model = new ParentModel({ items: ["a", 1 as any] });

    await expect(
      oneToManyOnCreate.call(
        { adapter: { alias: "alias" } },
        context,
        { cascade: { update: Cascade.CASCADE } } as any,
        "items",
        model
      )
    ).rejects.toThrow("Invalid operation");
  });

  it("oneToManyOnDelete skips when cascade not enabled", async () => {
    const model = new ParentModel({ items: ["a", "b"] });

    const repo = { delete: jest.fn() };
    (repositoryFromTypeMetadata as jest.Mock).mockReturnValue(repo);

    await oneToManyOnDelete.call(
      { adapter: { alias: "alias" } },
      context,
      { cascade: { delete: Cascade.NONE } } as any,
      "items",
      model
    );

    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("populate retrieves related instances using cache first", async () => {
    const repo = {
      read: jest.fn().mockResolvedValue(new ChildModel({ id: "c-1" })),
    };
    const getSpy = jest
      .spyOn(context as any, "get")
      .mockRejectedValue(new Error("missing"));
    (repositoryFromTypeMetadata as jest.Mock).mockReturnValue(repo);

    const model = new ParentModel({ child: "c-1" });

    await populate.call(
      { adapter: { alias: "alias" } },
      context,
      { populate: true } as any,
      "child",
      model
    );

    expect(getSpy).toHaveBeenCalled();
    expect(repo.read).toHaveBeenCalledWith("c-1", context);
    expect(model.child).toBeInstanceOf(ChildModel);
    getSpy.mockRestore();
  });
});
