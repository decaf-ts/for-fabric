import "reflect-metadata";

import { pk } from "@decaf-ts/core";
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

describe("FabricClientRepository", () => {
  const createAdapter = () =>
    ({
      alias: `adapter-${Math.random().toString(36).slice(2)}`,
    } as any);

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
