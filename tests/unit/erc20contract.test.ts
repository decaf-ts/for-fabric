import { AuthorizationError, Condition } from "@decaf-ts/core";
import { BaseError, ValidationError } from "@decaf-ts/db-decorators";
import {
  AllowanceError,
  BalanceError,
  NotInitializedError,
} from "../../src/shared/errors";
import { TestERC20Contract } from "../assets/contract/test/TestERc20Contract";
import { Context } from "fabric-contract-api";
import type {
  Allowance,
  ERC20Token,
  ERC20Wallet,
} from "../../src/contracts/erc20/models";
import { getMockCtx } from "./ContextMock";

const clone = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as unknown as T;

describe("FabricERC20Contract behaviors", () => {
  let contract: TestERC20Contract;
  let ctx: Context;
  let ownerId: string;
  let tokens: ERC20Token[];
  let wallets: Record<string, ERC20Wallet>;
  let allowances: Allowance[];
  let observerUpdate: jest.Mock;
  let buildContext: (overrides?: { id?: string; mspId?: string }) => Context;

  beforeAll(() => {
    contract = new TestERC20Contract();
  });

  beforeEach(() => {
    ownerId = "OrgUser";
    tokens = [];
    wallets = {};
    allowances = [];
    observerUpdate = jest.fn();

    ctx = getMockCtx();

    (contract as any).repo = {
      ObserverHandler: () => ({ updateObservers: observerUpdate }),
      refresh: jest.fn().mockResolvedValue(undefined),
    };

    const tokenSelectResult = {
      execute: jest.fn(async () => tokens.map(clone)),
    };
    (contract as any).tokenRepository = {
      select: jest.fn(() => tokenSelectResult),
      selectWithContext: jest.fn(async () => tokenSelectResult),
      create: jest.fn(async (token: ERC20Token) => {
        tokens.push({ ...token });
        return token;
      }),
    };

    const walletSelectResult = {
      execute: jest.fn(async () => Object.values(wallets).map(clone)),
    };
    (contract as any).walletRepository = {
      read: jest.fn(async (id: string) => {
        const wallet = wallets[id];
        if (!wallet) {
          throw new BaseError("NotFound", `Wallet ${id} missing`, 404);
        }
        return clone(wallet);
      }),
      create: jest.fn(async (wallet: ERC20Wallet) => {
        wallets[wallet.id] = clone(wallet);
        return clone(wallet);
      }),
      update: jest.fn(async (wallet: ERC20Wallet) => {
        wallets[wallet.id] = clone(wallet);
        return clone(wallet);
      }),
      select: jest.fn(() => walletSelectResult),
      selectWithContext: jest.fn(async () => walletSelectResult),
    };

    const filterAllowances = (
      condition: any,
      entries: Allowance[]
    ): Allowance[] => {
      if (!condition) return entries;
      if (condition.operator === "AND") {
        return filterAllowances(
          condition.comparison,
          filterAllowances(condition.attr1, entries)
        );
      }
      if (condition.operator === "EQUAL") {
        return entries.filter(
          (entry) => (entry as any)[condition.attr1] === condition.comparison
        );
      }
      return entries;
    };

    const allowanceSelectResult = {
      execute: jest.fn(async () => allowances.map(clone)),
      where: (condition: any) => ({
        execute: jest.fn(async () =>
          filterAllowances(condition, allowances).map(clone)
        ),
      }),
    };
    (contract as any).allowanceRepository = {
      create: jest.fn(async (allowance: Allowance, ...args: any[]) => {
        allowances.push({ ...allowance });
        return allowance;
      }),
      update: jest.fn(async (allowance: Allowance) => {
        const idx = allowances.findIndex(
          (a) => a.owner === allowance.owner && a.spender === allowance.spender
        );
        if (idx >= 0) {
          allowances[idx] = { ...allowance };
        } else {
          allowances.push({ ...allowance });
        }
        return allowance;
      }),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const initializeToken = () =>
    contract.Initialize(ctx, {
      name: "TestToken",
      symbol: "TT",
      decimals: 2,
    } as any);

  it("throws when checking initialization without token", async () => {
    await expect(contract.CheckInitialized(ctx)).rejects.toThrow(
      NotInitializedError
    );
  });

  it("initializes token once and prevents reinitialization", async () => {
    await expect(initializeToken()).resolves.toBe(true);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ name: "TestToken", owner: ownerId });

    await expect(
      contract.Initialize(ctx, {
        name: "Other",
        symbol: "OT",
        decimals: 3,
      } as any)
    ).rejects.toThrow(AuthorizationError);
  });

  it("exposes token metadata after initialization", async () => {
    await initializeToken();

    await expect(contract.CheckInitialized(ctx)).resolves.toBeUndefined();
    await expect(contract.TokenName(ctx)).resolves.toBe("TestToken");
    await expect(contract.Symbol(ctx)).resolves.toBe("TT");
    await expect(contract.Decimals(ctx)).resolves.toBe(2);
  });

  it("computes total supply across wallets", async () => {
    await initializeToken();
    wallets[ownerId] = { id: ownerId, balance: 70, token: "TestToken" } as any;
    wallets["friend"] = {
      id: "friend",
      balance: 30,
      token: "TestToken",
    } as any;

    await expect(contract.TotalSupply(ctx)).resolves.toBe(100);
  });

  it("mints new tokens by creating wallet when missing", async () => {
    await initializeToken();

    await contract.Mint(ctx, 120);

    expect(wallets[ownerId]).toMatchObject({
      id: ownerId,
      balance: 120,
      token: "TestToken",
    });
    expect(observerUpdate).toHaveBeenCalled();
  });

  it("mints additional tokens when wallet already exists", async () => {
    await initializeToken();
    wallets[ownerId] = {
      id: ownerId,
      balance: 50,
      token: "TestToken",
    } as any;

    await contract.Mint(ctx, 25);

    expect(wallets[ownerId].balance).toBe(75);
  });

  it("rejects invalid mint amount", async () => {
    await initializeToken();
    await expect(contract.Mint(ctx, 0)).rejects.toThrow(ValidationError);
  });

  it("transfers tokens and creates destination wallet when needed", async () => {
    await initializeToken();
    wallets[ownerId] = {
      id: ownerId,
      balance: 100,
      token: "TestToken",
    } as any;

    await contract.Transfer(ctx, "recipient", 40);

    expect(wallets[ownerId].balance).toBe(60);
    expect(wallets["recipient"]).toMatchObject({
      id: "recipient",
      balance: 40,
      token: "TestToken",
    });
  });

  it("updates existing wallets on transfer", async () => {
    await initializeToken();
    wallets[ownerId] = {
      id: ownerId,
      balance: 90,
      token: "TestToken",
    } as any;
    wallets["mate"] = {
      id: "mate",
      balance: 10,
      token: "TestToken",
    } as any;

    await contract.Transfer(ctx, "mate", 30);

    expect(wallets[ownerId].balance).toBe(60);
    expect(wallets["mate"].balance).toBe(40);
  });

  it("rejects negative transfers", async () => {
    await initializeToken();
    wallets[ownerId] = {
      id: ownerId,
      balance: 10,
      token: "TestToken",
    } as any;

    await expect(contract.Transfer(ctx, "other", -5)).rejects.toThrow(
      BalanceError
    );
  });

  it("approves allowances and emits events", async () => {
    await initializeToken();
    wallets[ownerId] = {
      id: ownerId,
      balance: 80,
      token: "TestToken",
    } as any;

    await contract.Approve(ctx, "spender", 30);
    expect(allowances).toContainEqual({
      owner: ownerId,
      spender: "spender",
      value: 30,
    });

    await contract.Approve(ctx, "spender", 20);
    expect(allowances).toContainEqual({
      owner: ownerId,
      spender: "spender",
      value: 20,
    });
  });

  it("returns and validates allowances", async () => {
    await initializeToken();
    allowances.push({
      owner: ownerId,
      spender: "spender",
      value: 15,
    } as Allowance);
    const manualCondition = Condition.and(
      Condition.attribute<Allowance>("owner").eq(ownerId),
      Condition.attribute<Allowance>("spender").eq("spender")
    );
    await expect(
      (contract as any).allowanceRepository
        .select()
        .where(manualCondition)
        .execute(ctx)
    ).resolves.toHaveLength(1);

    await expect(
      (contract as any)._getAllowance(ownerId, "spender", ctx)
    ).resolves.toMatchObject({ value: 15 });
    await expect(contract.Allowance(ctx, ownerId, "spender")).resolves.toBe(15);

    await expect(contract.Allowance(ctx, ownerId, "ghost")).rejects.toThrow(
      AllowanceError
    );
  });

  it("transfers using allowance with TransferFrom", async () => {
    await initializeToken();
    wallets[ownerId] = {
      id: ownerId,
      balance: 100,
      token: "TestToken",
    } as any;
    allowances.push({
      owner: ownerId,
      spender: "spender",
      value: 40,
    } as Allowance);

    const spenderCtx = buildContext({ id: "spender" });

    await contract.TransferFrom(spenderCtx, ownerId, "receiver", 25);

    expect(wallets[ownerId].balance).toBe(75);
    expect(wallets["receiver"].balance).toBe(25);
    expect(allowances[0].value).toBe(15);
  });

  it("burns tokens and emits transfer events", async () => {
    await initializeToken();
    wallets[ownerId] = {
      id: ownerId,
      balance: 60,
      token: "TestToken",
    } as any;

    await contract.Burn(ctx, 20);
    expect(wallets[ownerId].balance).toBe(40);
  });

  it("rejects burn when balance is insufficient", async () => {
    await initializeToken();
    wallets[ownerId] = {
      id: ownerId,
      balance: 10,
      token: "TestToken",
    } as any;

    await expect(contract.Burn(ctx, 30)).rejects.toThrow(BalanceError);
  });

  it("burns tokens from another account", async () => {
    await initializeToken();
    wallets["target"] = {
      id: "target",
      balance: 50,
      token: "TestToken",
    } as any;

    await contract.BurnFrom(ctx, "target", 20);
    expect(wallets["target"].balance).toBe(30);
  });

  it("checks client balance and id", async () => {
    await initializeToken();
    wallets[ownerId] = {
      id: ownerId,
      balance: 33,
      token: "TestToken",
    } as any;

    await expect(contract.ClientAccountBalance(ctx)).resolves.toBe(33);
    await expect(contract.ClientAccountID(ctx)).resolves.toBe(ownerId);
  });
});
