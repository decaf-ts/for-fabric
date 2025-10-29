import "reflect-metadata";

import {
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Sequence } from "@decaf-ts/core";
import { FabricERC20ClientRepository } from "../../src/client/erc20/FabricERC20ClientRepository";
import type { FabricClientAdapter } from "../../src/client/FabricClientAdapter";

describe("FabricERC20ClientRepository", () => {
  const createRepository = (adapter?: Partial<FabricClientAdapter>) => {
    const repoAdapter = Object.assign(
      {
        submitTransaction: jest.fn(),
        alias: `adapter-${Math.random().toString(36).slice(2)}`,
      },
      adapter
    );
    const repo = new FabricERC20ClientRepository(
      repoAdapter as FabricClientAdapter
    );
    jest.spyOn(repo as any, "log", "get").mockReturnValue({
      for: () => ({
        verbose: jest.fn(),
      }),
    });
    return repo;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("throws when observer handler is missing", async () => {
    const repo = createRepository();
    await expect(
      repo.updateObservers("erc20_wallets", OperationKeys.CREATE, "wallet-1")
    ).rejects.toThrow(InternalError);
  });

  it("updates observers with parsed string id", async () => {
    const repo = createRepository();
    const updateObservers = jest.fn().mockResolvedValue(undefined);
    const observerHandler = {
      count: () => 1,
      updateObservers,
    };
    Object.assign(repo, { observerHandler });

    jest
      .spyOn(Sequence, "parseValue")
      .mockImplementation((_type: any, value: any) => `parsed-${value}`);

    await repo.updateObservers(
      "erc20_wallets",
      OperationKeys.UPDATE,
      "wallet-42"
    );

    expect(updateObservers).toHaveBeenCalledWith(
      expect.anything(),
      "erc20_wallets",
      OperationKeys.UPDATE,
      "parsed-wallet-42"
    );
  });

  it("updates observers with parsed array ids", async () => {
    const repo = createRepository();
    const updateObservers = jest.fn().mockResolvedValue(undefined);
    Object.assign(repo, {
      observerHandler: { count: () => 2, updateObservers },
    });

    jest
      .spyOn(Sequence, "parseValue")
      .mockImplementation((_type: any, value: any) => `parsed-${value}`);

    await repo.updateObservers(
      "erc20_wallets",
      BulkCrudOperationKeys.CREATE_ALL,
      ["wallet-1", "wallet-2"]
    );

    expect(updateObservers).toHaveBeenCalledWith(
      expect.anything(),
      "erc20_wallets",
      BulkCrudOperationKeys.CREATE_ALL,
      ["parsed-wallet-1", "parsed-wallet-2"]
    );
  });

  it("passes undefined ids through when not provided", async () => {
    const repo = createRepository();
    const updateObservers = jest.fn().mockResolvedValue(undefined);
    Object.assign(repo, {
      observerHandler: { count: () => 1, updateObservers },
    });

    await repo.updateObservers(
      "erc20_wallets",
      OperationKeys.DELETE,
      undefined as unknown as string
    );

    expect(updateObservers).toHaveBeenCalledWith(
      expect.anything(),
      "erc20_wallets",
      OperationKeys.DELETE,
      undefined
    );
  });

  it("decodes transaction results into strings", async () => {
    const submitTransaction = jest
      .fn()
      .mockResolvedValue(new TextEncoder().encode("MyToken"));
    const repo = createRepository({ submitTransaction } as any);

    await expect(repo.tokenName()).resolves.toBe("MyToken");
    expect(submitTransaction).toHaveBeenCalledWith("TokenName");
  });

  it("converts numeric transaction payloads", async () => {
    const submitTransaction = jest
      .fn()
      .mockResolvedValue(new TextEncoder().encode("1337"));
    const repo = createRepository({ submitTransaction } as any);

    await expect(repo.totalSupply()).resolves.toBe(1337);
    expect(submitTransaction).toHaveBeenCalledWith("TotalSupply");
  });

  it("translates boolean transaction payloads", async () => {
    const submitTransaction = jest
      .fn()
      .mockResolvedValueOnce(new TextEncoder().encode("true"))
      .mockResolvedValueOnce(new TextEncoder().encode("false"));
    const repo = createRepository({ submitTransaction } as any);

    await expect(repo.transfer("to", 10)).resolves.toBe(true);
    await expect(repo.approve("spender", 5)).resolves.toBe(false);
    expect(submitTransaction).toHaveBeenNthCalledWith(1, "Transfer", [
      "to",
      "10",
    ]);
    expect(submitTransaction).toHaveBeenNthCalledWith(2, "Approve", [
      "spender",
      "5",
    ]);
  });
});
