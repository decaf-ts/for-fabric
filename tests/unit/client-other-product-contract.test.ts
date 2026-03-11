import "reflect-metadata";

import { Context, PersistenceKeys, Paginator } from "@decaf-ts/core";
import { OrderDirection } from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import { FabricClientRepository } from "../../src/client/FabricClientRepository";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { FabricClientPaginator } from "../../src/client/FabricClientPaginator";
import { OtherProductStrength } from "../../src/contract/models/OtherProductStrength";
import { FabricFlavour } from "../../src/shared/constants";

const logger = {
  for: jest.fn().mockReturnThis(),
  clear: jest.fn().mockReturnThis(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  silly: jest.fn(),
} as any;

const createContext = () => {
  const ctx = new Context();
  ctx.accumulate({
    logger,
    ignoreHandlers: false,
    ignoreValidation: false,
    breakOnHandlerError: false,
  } as any);
  Object.defineProperty(ctx, "logger", {
    get: () => logger,
    configurable: true,
  });
  return ctx;
};

const stubAdapter = {
  alias: "test",
  flavour: FabricFlavour,
  prepare: jest.fn((model: any) => ({
    id:
      (model as any).productCode ||
      (model as any)[Model.pk(model.constructor as Constructor<Model>)] ||
        "generated",
    record: model,
    transient: {},
    segregated: {},
  })),
  logCtx: jest.fn((args: any[], operation: any) => {
    const previous = args.findIndex((arg) => arg instanceof Context);
    const ctx =
      previous >= 0
        ? (args[previous] as Context)
        : createContext();
    const ctxArgs = args
      .filter((_, index) => index !== previous)
      .concat(ctx);
    const response: any = {
      log: logger,
      ctx,
      ctxArgs,
    };
    response.for = () => response;
    return response;
  }),
  create: jest.fn(async (_clazz: any, _id: any, record: any) => record),
  update: jest.fn(async (_clazz: any, _id: any, record: any) => record),
  delete: jest.fn(async (_clazz: any, _id: any) => ({ id: _id })),
  createAll: jest.fn(async (_clazz: any, _ids: any[], records: any[]) => records),
  updateAll: jest.fn(async (_clazz: any, records: any[]) => records),
  deleteAll: jest.fn(async (_clazz: any, ids: any[]) => ids.map((id) => ({ id }))),
  read: jest.fn(async (_clazz: any, id: any) => ({ productCode: id })),
  readAll: jest.fn(async (_clazz: any, ids: any[]) =>
    ids.map((id) => ({ productCode: id }))
  ),
  evaluateTransaction: jest.fn(async () => Buffer.from(JSON.stringify([]))),
  decode: (value: Buffer) => value.toString("utf8"),
  revert: jest.fn((record: any) => record),
  Statement: jest.fn(() => {
    const builder: any = {
      command: ["select"],
      selector: undefined as any,
      clazz: undefined as any,
      whereCondition: undefined as any,
      orderKey: undefined as any,
      orderDirection: undefined as any,
      select(this: any, selector?: readonly any[]) {
        this.selector = selector;
        return this;
      },
      from(this: any, clazz: any) {
        this.clazz = clazz;
        return this;
      },
      where(this: any, condition: any) {
        this.whereCondition = condition;
        this.command = ["select", condition];
        return this;
      },
      orderBy(this: any, key: string, direction: OrderDirection) {
        this.orderKey = key;
        this.orderDirection = direction;
        this.command = ["select", this.whereCondition, key, direction];
        return this;
      },
      execute: async function (this: any, ctx: Context) {
        const data = await stubAdapter.evaluateTransaction(
          ctx,
          PersistenceKeys.STATEMENT,
          ["select", JSON.stringify(this.command)],
          undefined,
          undefined,
          OtherProductStrength.name
        );
        return JSON.parse(stubAdapter.decode(data as Buffer));
      },
      prepare: async function (this: any) {
        return this;
      },
    };
    return builder;
  }),
} as unknown as FabricClientAdapter;

describe("client other-product strength repository", () => {
  const repo = new FabricClientRepository(stubAdapter, OtherProductStrength);

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("performs read and bulk read through the adapter", async () => {
    const ctx = createContext();
    const readValue = { productCode: "strength-1" };
    (stubAdapter.read as jest.Mock).mockResolvedValue(readValue);

    const result = await repo.read("strength-1", ctx);
    expect(stubAdapter.read).toHaveBeenCalledWith(OtherProductStrength, "strength-1", ctx);
    expect(result.productCode).toBe("strength-1");

    (stubAdapter.readAll as jest.Mock).mockResolvedValue([{
      productCode: "strength-2",
    }]);
    const bulk = await repo.readAll(["strength-2"], ctx);
    expect(stubAdapter.readAll).toHaveBeenCalledWith(
      OtherProductStrength,
      ["strength-2"],
      ctx
    );
    expect(bulk).toHaveLength(1);
  });

  it("routes listBy/paginateBy/find/page through prepared statements", async () => {
    const ctx = createContext();
    const listPayload = [{ productCode: "strength-3" }];
    const pagePayload = {
      data: [{ productCode: "strength-4" }],
      current: 1,
      count: 1,
      total: 1,
      bookmark: "bookmark-1",
    };
    const findPayload = [{ productCode: "strength-5" }];
    const pageByPayload = {
      data: [{ productCode: "strength-6" }],
      current: 1,
      count: 1,
      total: 1,
      bookmark: "bookmark-2",
    };

    (stubAdapter.evaluateTransaction as jest.Mock)
      .mockResolvedValueOnce(Buffer.from(JSON.stringify(listPayload)))
      .mockResolvedValueOnce(Buffer.from(JSON.stringify(pagePayload)))
      .mockResolvedValueOnce(Buffer.from(JSON.stringify(findPayload)))
      .mockResolvedValueOnce(Buffer.from(JSON.stringify(pageByPayload)));

    const listed = await repo.listBy("productCode", OrderDirection.ASC, ctx);
    expect(listed[0].productCode).toBe("strength-3");
    expect(stubAdapter.evaluateTransaction).toHaveBeenCalled();
    const statementCall = (stubAdapter.evaluateTransaction as jest.Mock).mock
      .calls[0];
    expect(statementCall[0]).toBe(ctx);
    expect(statementCall[1]).toBe(PersistenceKeys.STATEMENT);
    expect(statementCall[5]).toBe(OtherProductStrength.name);
    const callPayload = JSON.parse(statementCall[2][1]);
    expect(callPayload[0]).toBe("productCode");
    expect(callPayload[1]).toBe(OrderDirection.ASC);

    const paginated = await repo.paginateBy(
      "productCode",
      OrderDirection.ASC,
      { offset: 1, limit: 1 },
      ctx
    );
    expect(Paginator.isSerializedPage(paginated)).toBe(true);
    expect(paginated.data[0].productCode).toBe("strength-4");

    const found = await repo.find("strength", OrderDirection.ASC, ctx);
    expect(found[0].productCode).toBe("strength-5");

    const pageResult = await repo.page(
      "strength",
      OrderDirection.ASC,
      { offset: 1, limit: 1 },
      ctx
    );
    expect(Paginator.isSerializedPage(pageResult)).toBe(true);
    expect(pageResult.data[0].productCode).toBe("strength-6");
  });

  it("routes select queries through prepared statements", async () => {
    const ctx = createContext();
    const selectPayload = [{ productCode: "select-1" }];
    (stubAdapter.evaluateTransaction as jest.Mock).mockResolvedValueOnce(
      Buffer.from(JSON.stringify(selectPayload))
    );

    const result = await repo
      .select()
      .where({ productCode: "select-1" })
      .orderBy("productCode", OrderDirection.ASC)
      .execute(ctx);

    expect(result[0].productCode).toBe("select-1");
    const selectCall =
      (stubAdapter.evaluateTransaction as jest.Mock).mock.calls[0];
    expect(selectCall[1]).toBe(PersistenceKeys.STATEMENT);
    expect(selectCall[2][0]).toBe("select");
  });
});

describe("FabricClientPaginator navigation helpers", () => {
  class DummyPaginator extends FabricClientPaginator<OtherProductStrength> {
    protected async page(
      page: number = 1,
      bookmark?: string,
      ...args: any[]
    ): Promise<any[]> {
      this._currentPage = page;
      this._bookmark = bookmark;
      return [];
    }
  }

  afterEach(() => jest.restoreAllMocks());

  it("advances and rewinds through pages", async () => {
    const paginator = new DummyPaginator(stubAdapter, {} as any, 1, OtherProductStrength);
    const spy = jest.spyOn(paginator, "page");

    paginator.apply({
      data: [],
      current: 1,
      count: 3,
      total: 3,
      bookmark: "bookmark-1",
    });

    expect(paginator.current).toBe(1);

    await paginator.next();
    expect(spy).toHaveBeenLastCalledWith(2);
    expect(paginator.current).toBe(2);

    await paginator.previous();
    expect(spy).toHaveBeenLastCalledWith(1);
    expect(paginator.current).toBe(1);
  });
});
