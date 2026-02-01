import "reflect-metadata";

import { pk, OrderDirection } from "@decaf-ts/core";
import { Context, OperationKeys } from "@decaf-ts/db-decorators";
import { model, Model } from "@decaf-ts/decorator-validation";
import { FabricClientRepository } from "../../src/client/FabricClientRepository";

@model()
class Wallet extends Model {
  @pk()
  id!: string;
}

class TestFabricClientRepository extends FabricClientRepository<Wallet> {
  public async callCreatePrefix(model: Wallet, ...args: any[]) {
    return super.createPrefix(model, ...args);
  }

  public async callCreateAllPrefix(models: Wallet[], ...args: any[]) {
    return super.createAllPrefix(models, ...args);
  }

  public async callReadPrefix(key: string, ...args: any[]) {
    return super.readPrefix(key, ...args);
  }

  public async callDeletePrefix(key: string, ...args: any[]) {
    return super.deletePrefix(key, ...args);
  }
}

const createAdapter = () => {
  const logger = {
    info: jest.fn(),
    verbose: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    silly: jest.fn(),
  } as any;

  return {
    alias: `adapter-${Math.random().toString(36).slice(2)}`,
    flavour: "hlf-fabric",
    logCtx: jest.fn().mockImplementation((ctxArgs: any[]) => {
      const contextualized: any = {
        ctx: new Context(),
        log: logger,
        ctxArgs: Array.isArray(ctxArgs) ? [...ctxArgs] : [],
      };
      contextualized.for = (_method: any) => contextualized;
      return contextualized;
    }),
  } as any;
};

describe.skip("FabricClientRepository", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("creates models with context arguments", async () => {
    const adapter = createAdapter();
    const repo = new TestFabricClientRepository(adapter, Wallet);
    const contextSpy = jest
      .spyOn(Context, "args")
      .mockResolvedValue({ args: ["ctx-arg"] });

    const [model, arg] = await repo.callCreatePrefix(
      new Wallet({ id: "wallet-1" })
    );

    expect(model).toBeInstanceOf(Wallet);
    expect(arg).toBe("ctx-arg");
    expect(contextSpy).toHaveBeenCalledWith(
      OperationKeys.CREATE,
      Wallet,
      [],
      adapter,
      {}
    );
  });

  it("forwards bulk create context arguments", async () => {
    const adapter = createAdapter();
    const repo = new TestFabricClientRepository(adapter, Wallet);
    const contextSpy = jest
      .spyOn(Context, "args")
      .mockResolvedValue({ args: ["ctx-create-all"] });

    const [, arg] = await repo.callCreateAllPrefix([], "custom");

    expect(arg).toBe("ctx-create-all");
    expect(contextSpy).toHaveBeenCalledWith(
      OperationKeys.CREATE,
      Wallet,
      ["custom"],
      adapter,
      {}
    );
  });

  it("reads and validates before delete operations", async () => {
    const adapter = createAdapter();
    const repo = new TestFabricClientRepository(adapter, Wallet);
    const contextSpy = jest
      .spyOn(Context, "args")
      .mockResolvedValue({ args: ["ctx-delete"] });
    const readSpy = jest.spyOn(repo, "read").mockResolvedValue({ id: "ok" });

    const [key, arg] = await repo.callDeletePrefix("wallet-9");

    expect(readSpy).toHaveBeenCalledWith("wallet-9", "ctx-delete");
    expect(key).toBe("wallet-9");
    expect(arg).toBe("ctx-delete");
    expect(contextSpy).toHaveBeenCalledWith(
      OperationKeys.DELETE,
      Wallet,
      [],
      adapter,
      {}
    );
  });
});

describe("FabricClientRepository default query statements", () => {
  const adapter = createAdapter();
  const repo = new FabricClientRepository(adapter, Wallet);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("routes find through the statement API", async () => {
    const statementSpy = jest
      .spyOn(repo, "statement")
      .mockResolvedValue([] as any);
    await repo.find("prefix", OrderDirection.DSC);

    const call = statementSpy.mock.calls[0];
    expect(call[0]).toBe(repo.find.name);
    expect(call[1]).toBe("prefix");
    expect(call[2]).toBe(OrderDirection.DSC);
    expect(statementSpy).toHaveBeenCalledTimes(1);
  });

  it("routes page through the statement API", async () => {
    const statementSpy = jest
      .spyOn(repo, "statement")
      .mockResolvedValue({ data: [] } as any);
    const ref = { offset: 2, limit: 5 };
    await repo.page("search", OrderDirection.ASC, ref);

    const call = statementSpy.mock.calls[0];
    expect(call[0]).toBe(repo.page.name);
    expect(call[1]).toBe("search");
    expect(call[2]).toBe(OrderDirection.ASC);
    expect(call[3]).toEqual(ref);
    expect(statementSpy).toHaveBeenCalledTimes(1);
  });
});
