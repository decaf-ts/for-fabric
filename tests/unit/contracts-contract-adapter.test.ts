import "reflect-metadata";

import { Model, model } from "@decaf-ts/decorator-validation";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import {
  FabricContractAdapter,
  createdByOnFabricCreateUpdate,
  pkFabricOnCreate,
} from "../../src/contracts/ContractAdapter";
import type { FabricContractRepository } from "../../src/contracts/FabricContractRepository";
import type { FabricContractSequence } from "../../src/contracts/FabricContractSequence";
import type { SequenceOptions } from "@decaf-ts/core";
import { OrderDirection, UnsupportedError, pk, table } from "@decaf-ts/core";
import { OperationKeys } from "@decaf-ts/db-decorators";
import type { Logger } from "@decaf-ts/logging";
import { prop, uses } from "@decaf-ts/decoration";
import { ChaincodeStub, ClientIdentity } from "fabric-shim-api";
import { privateData } from "../../src/shared/decorators";
import { FabricFlavour } from "../../src/shared/constants";
import { getStubMock } from "./ContextMock";

@model()
class TestModel extends Model {
  @prop()
  public createdBy?: string;

  @prop()
  public id?: string;

  constructor(data?: Partial<TestModel>) {
    super(data);
  }
}

@table("audit")
@model()
class AuditQueryModel extends Model {
  @pk()
  id!: string;
}

const RANGE_COLLECTION = "range-pk-private";

@uses(FabricFlavour)
@table("range_pagination")
@model()
class RangePaginationModel extends Model {
  @pk()
  id!: string;

  @prop()
  label?: string;

  @privateData(RANGE_COLLECTION)
  secret?: string;
}

const createContext = (identity?: Partial<ClientIdentity>) => {
  const context = new FabricContractContext();
  const logger = {
    for: jest.fn().mockReturnThis(),
    clear: jest.fn().mockReturnThis(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
  };
  context.accumulate({
    identity,
    logger,
  } as any);
  return context;
};

describe("contracts/ContractAdapter helpers", () => {
  it("createdByOnFabricCreateUpdate assigns identity id to target property", async () => {
    const clientIdentity = { getID: jest.fn().mockReturnValue("user::1") };
    const context = createContext(clientIdentity as ClientIdentity);

    const model = new TestModel();

    await createdByOnFabricCreateUpdate.call(
      {} as FabricContractRepository<any>,
      context,
      {} as any,
      "createdBy",
      model
    );

    expect(model.createdBy).toBe("user::1");
    expect(clientIdentity.getID).toHaveBeenCalledTimes(1);
  });

  it("resultIterator parses iterator values and closes iterator", async () => {
    class TestAdapter extends FabricContractAdapter {
      public async readResults(log: Logger, iterator: any) {
        // Access protected method for testing
        return await (this as any).resultIterator(log, iterator, false);
      }
    }

    const adapter = new TestAdapter(
      undefined as any,
      `adapter-${Math.random().toString(36).slice(2)}`
    );
    const log = {
      debug: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;

    const iterator = {
      next: jest
        .fn()
        .mockResolvedValueOnce({
          value: { value: Buffer.from(JSON.stringify({ foo: "bar" })) },
          done: false,
        })
        .mockResolvedValueOnce({ done: true }),
      close: jest.fn(),
    } as unknown as any;

    const results = await adapter.readResults(log, iterator);

    expect(results).toEqual([{ foo: "bar" }]);
    expect(iterator.next).toHaveBeenCalledTimes(2);
    expect(iterator.close).toHaveBeenCalledTimes(1);
  });

  it("paginateByPrimaryKeyRange uses Fabric range APIs and preserves bookmarks", async () => {
    const adapter = new FabricContractAdapter(
      undefined as any,
      `adapter-${Math.random().toString(36).slice(2)}`
    );
    jest.spyOn(adapter as any, "revert").mockImplementation(
      (record: Record<string, any>, _clazz: any, id: string) => ({
        ...record,
        id,
      })
    );
    const stub = getStubMock();
    const ctx = createContext({
      getID: () => "user",
      getMSPID: () => "Org1MSP",
      getAttributeValue: () => "value",
      getIDBytes: () => Buffer.from("id"),
    } as ClientIdentity);
    ctx.put("stub", stub as any);
    ctx.markFullySegregated();
    ctx.readFrom(RANGE_COLLECTION);

    for (const entry of [
      { id: "id-1", label: "one", secret: "s1" },
      { id: "id-2", label: "two", secret: "s2" },
      { id: "id-3", label: "three", secret: "s3" },
    ]) {
      await stub.putPrivateData(
        RANGE_COLLECTION,
        stub.createCompositeKey("range_pagination", [entry.id]),
        Buffer.from(JSON.stringify(entry), "utf8")
      );
    }
    stub.commit();

    const page = await adapter.paginateByPrimaryKeyRange(
      RangePaginationModel,
      OrderDirection.ASC,
      { limit: 2, offset: 1 },
      ctx
    );

    expect(page.current).toBe(1);
    expect(page.count).toBe(2);
    expect(page.data.map((m) => m.id)).toEqual(["id-1", "id-2"]);
    expect(page.data.map((m) => m.label)).toEqual(["one", "two"]);
    expect(page.data.map((m) => m.secret)).toEqual(["s1", "s2"]);
    expect(page.bookmark).toBe(
      stub.createCompositeKey("range_pagination", ["id-2"])
    );
  });

  it("createdByOnFabricCreateUpdate throws UnsupportedError when identity missing", async () => {
    const context = new FabricContractContext();
    const model = new TestModel();

    await expect(
      createdByOnFabricCreateUpdate.call(
        {} as FabricContractRepository<any>,
        context,
        {} as any,
        "createdBy",
        model
      )
    ).rejects.toBeInstanceOf(UnsupportedError);
  });

  it("applies transient overrides in contract adapter logCtx when enabled", async () => {
    class TestAdapter extends FabricContractAdapter {
      public callLogCtx(...args: any[]) {
        return super.logCtx(...args);
      }
    }

    const adapter = new TestAdapter(undefined as any, `adapter-${Math.random().toString(36).slice(2)}`);
    const fakeStub = {
      getTransient: () => transient,
    };
    const transient = new Map<string, Buffer>([
      [
        "__overrides",
        Buffer.from(
          JSON.stringify({
            allowGenerationOverride: true,
          })
        ),
      ],
    ]);
    const context = createContext();
    const contextWithOverrides = context.override({
      allowContextTransientMap: true,
      stub: fakeStub,
    }) as FabricContractContext;

    const { ctx } = await adapter.callLogCtx([contextWithOverrides], "create", true);

    expect(ctx.getOrUndefined("allowGenerationOverride")).toBe(true);
  });

  it.skip("pkFabricOnCreate requests sequence and defines immutable id", async () => {
    const context = new FabricContractContext();
    const nextValue = "42";
    const sequenceMock: Partial<FabricContractSequence> = {
      next: jest.fn().mockResolvedValue(nextValue),
    };
    const adapterMock = {
      Sequence: jest.fn().mockResolvedValue(sequenceMock),
    };
    const repositoryMock = {
      adapter: adapterMock,
    } as unknown as FabricContractRepository<TestModel>;

    const model = new TestModel();
    const sequenceOptions = { type: Number } as SequenceOptions;

    await pkFabricOnCreate.call(
      repositoryMock,
      context,
      sequenceOptions,
      "id",
      model
    );

    expect(adapterMock.Sequence).toHaveBeenCalledTimes(1);
    expect(adapterMock.Sequence).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.any(String), type: Number })
    );
    expect(model.id).toBe(nextValue);
    const descriptor = Object.getOwnPropertyDescriptor(model, "id");
    expect(descriptor?.writable).toBe(false);
    expect(sequenceMock.next).toHaveBeenCalledWith(context);
  });

  describe("FabricContractAdapter observables", () => {
    const createAdapter = () =>
      new FabricContractAdapter(undefined as any, `adapter-${Math.random()}`);

    const createContext = () => {
      const ctx = new FabricContractContext();
      ctx.accumulate({
        stub: {
          getDateTimestamp: () => new Date(),
          getTxID: () => "tx",
          getChannelId: () => "channel",
          setEvent: jest.fn(),
          getMspID: () => "Org1MSP",
        },
        identity: {
          getID: () => "user",
          getMSPID: () => "Org1MSP",
          getAttributeValue: () => "value",
          getIDBytes: () => Buffer.from("id"),
        },
        logger: {
          for: jest.fn().mockReturnThis(),
          clear: jest.fn().mockReturnThis(),
          info: jest.fn(),
          error: jest.fn(),
          verbose: jest.fn(),
          debug: jest.fn(),
        },
      } as any);
      return ctx;
    };

    it("notifies observers when no skip flags are set", async () => {
      const adapter = createAdapter();
      const handler = { updateObservers: jest.fn() };
      Object.defineProperty(adapter, "observerHandler", {
        value: handler,
        writable: true,
      });

      const ctx = createContext();
      await adapter.updateObservers(
        "table",
        OperationKeys.CREATE,
        "id-1",
        ctx
      );

      expect(handler.updateObservers).toHaveBeenCalledWith(
        "table",
        OperationKeys.CREATE,
        "id-1",
        "Org1MSP", // mspId extracted from stub.getMspID()
        undefined, // no result payload (no extra args before ctx)
        ctx
      );
    });

    it("skips notifications when context marks fully segregated", async () => {
      const adapter = createAdapter();
      const handler = { updateObservers: jest.fn() };
      Object.defineProperty(adapter, "observerHandler", {
        value: handler,
        writable: true,
      });
      const ctx = createContext();
      ctx.markFullySegregated();

      await adapter.updateObservers(
        "table",
        OperationKeys.CREATE,
        "id-1",
        ctx
      );

      expect(handler.updateObservers).not.toHaveBeenCalled();
    });

    it("respects noEmitSingle flag", async () => {
      const adapter = createAdapter();
      const handler = { updateObservers: jest.fn() };
      Object.defineProperty(adapter, "observerHandler", {
        value: handler,
        writable: true,
      });
      const ctx = createContext();
      ctx.put("noEmitSingle", true);

      await adapter.updateObservers(
        "table",
        OperationKeys.CREATE,
        "id-1",
        ctx
      );

      expect(handler.updateObservers).not.toHaveBeenCalled();
    });
  });

  it("routes bookmark-only raw queries through pagination without mutating the caller input", async () => {
    const adapter = new FabricContractAdapter(
      undefined as any,
      `adapter-${Math.random().toString(36).slice(2)}`
    );
    const context = createContext({
      getIDBytes: jest.fn().mockReturnValue(Buffer.from("id")),
      getAttributeValue: jest.fn().mockReturnValue(undefined),
      getID: jest.fn().mockReturnValue("client"),
    } as ClientIdentity);

    const iterator = {
      next: jest
        .fn()
        .mockResolvedValueOnce({
          value: {
            value: Buffer.from(JSON.stringify({ id: "row-1" })),
          },
          done: false,
        })
        .mockResolvedValue({ done: true }),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    const stub = {
      getQueryResultWithPagination: jest.fn().mockResolvedValue({
        iterator,
        metadata: { bookmark: "next" },
      }),
      getQueryResult: jest.fn(),
      getTxID: jest.fn().mockReturnValue("tx-1"),
    } as unknown as ChaincodeStub;

    context.accumulate({ stub } as any);

    const query = { selector: { foo: "bar" }, bookmark: "opaque-token" } as any;
    const result = await adapter.raw(query, false, context);

    expect(query).toEqual({
      selector: { foo: "bar" },
      bookmark: "opaque-token",
    });
    expect(stub.getQueryResultWithPagination).toHaveBeenCalledWith(
      JSON.stringify({ selector: { foo: "bar" } }),
      250,
      "opaque-token"
    );
    expect(result.docs).toEqual([{ id: "row-1" }]);
    expect(result.bookmark).toBe("next");
  });

  it("normalizes redundant null-lower-bound sort markers before executing public paginated queries", async () => {
    const adapter = new FabricContractAdapter(
      undefined as any,
      `adapter-${Math.random().toString(36).slice(2)}`
    );
    const context = createContext({
      getIDBytes: jest.fn().mockReturnValue(Buffer.from("id")),
      getAttributeValue: jest.fn().mockReturnValue(undefined),
      getID: jest.fn().mockReturnValue("client"),
    } as ClientIdentity);

    const iterator = {
      next: jest
        .fn()
        .mockResolvedValueOnce({
          value: {
            value: Buffer.from(JSON.stringify({ id: "row-1", model: "Product" })),
          },
          done: false,
        })
        .mockResolvedValue({ done: true }),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    const stub = {
      getQueryResultWithPagination: jest.fn().mockResolvedValue({
        iterator,
        metadata: { bookmark: "next" },
      }),
      getQueryResult: jest.fn(),
      getTxID: jest.fn().mockReturnValue("tx-1"),
    } as unknown as ChaincodeStub;

    context.accumulate({ stub } as any);

    const query = {
      selector: {
        $and: [
          { model: { $gte: "Pro", $lt: "Prp" } },
          { "??table": { $eq: "audit" } },
        ],
        model: { $gt: null },
      },
      sort: [{ model: "asc" }, { id: "asc" }],
      use_index: "audit_model_defaultQuery_asc_index",
      limit: 5,
    } as any;

    const result = await adapter.raw(query, false, context);

    expect(stub.getQueryResultWithPagination).toHaveBeenCalledWith(
      expect.stringContaining('"sort":[{"model":"asc"},{"id":"asc"}]'),
      5,
      undefined
    );
    expect(stub.getQueryResultWithPagination).toHaveBeenCalledWith(
      expect.not.stringContaining('"model":{"$gt":null}'),
      5,
      undefined
    );
    expect(result.docs).toEqual([{ id: "row-1", model: "Product" }]);
    expect(result.bookmark).toBe("next");
  });

  it("routes private limit-only raw queries through the simple private query path", async () => {
    const adapter = new FabricContractAdapter(
      undefined as any,
      `adapter-${Math.random().toString(36).slice(2)}`
    );
    const context = createContext({
      getIDBytes: jest.fn().mockReturnValue(Buffer.from("id")),
      getAttributeValue: jest.fn().mockReturnValue(undefined),
      getID: jest.fn().mockReturnValue("client"),
    } as ClientIdentity);

    const iterator = {
      next: jest
        .fn()
        .mockResolvedValueOnce({
          value: {
            value: Buffer.from(JSON.stringify({ id: "row-1", foo: "bar" })),
          },
          done: false,
        })
        .mockResolvedValue({ done: true }),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    const stub = {
      getPrivateDataQueryResult: jest.fn().mockResolvedValue({
        iterator,
      }),
      getQueryResultWithPagination: jest.fn(),
      getQueryResult: jest.fn(),
      getTxID: jest.fn().mockReturnValue("tx-1"),
    } as unknown as ChaincodeStub;

    context.accumulate({ stub } as any);

    const proxy = adapter.forPrivate("private-collection");
    const result = await (proxy as any).raw(
      { selector: { foo: "bar" }, limit: 1 },
      false,
      true,
      context
    );

    expect(stub.getPrivateDataQueryResult).toHaveBeenCalledWith(
      "private-collection",
      JSON.stringify({ selector: { foo: "bar" }, limit: 1 })
    );
    expect(stub.getQueryResultWithPagination).not.toHaveBeenCalled();
    expect(result.docs).toEqual([{ id: "row-1", foo: "bar" }]);
    expect(result.bookmark).toBeUndefined();
  });

  it("routes private limit+sort raw queries through the paginated private query path", async () => {
    const adapter = new FabricContractAdapter(
      undefined as any,
      `adapter-${Math.random().toString(36).slice(2)}`
    );
    const context = createContext({
      getIDBytes: jest.fn().mockReturnValue(Buffer.from("id")),
      getAttributeValue: jest.fn().mockReturnValue(undefined),
      getID: jest.fn().mockReturnValue("client"),
    } as ClientIdentity);

    const iterator = {
      next: jest
        .fn()
        .mockResolvedValueOnce({
          value: {
            value: Buffer.from(JSON.stringify({ id: "row-1", foo: "bar" })),
          },
          done: false,
        })
        .mockResolvedValue({ done: true }),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    const stub = {
      getPrivateDataQueryResult: jest.fn().mockResolvedValue({
        iterator,
      }),
      getQueryResultWithPagination: jest.fn(),
      getQueryResult: jest.fn(),
      getTxID: jest.fn().mockReturnValue("tx-1"),
    } as unknown as ChaincodeStub;

    context.accumulate({ stub } as any);

    const proxy = adapter.forPrivate("private-collection");
    const result = await (proxy as any).raw(
      { selector: { foo: "bar" }, sort: [{ foo: "asc" }], limit: 1 },
      false,
      true,
      context
    );

    expect(stub.getPrivateDataQueryResult).toHaveBeenCalledWith(
      "private-collection",
      expect.stringContaining('"sort":[{"foo":"asc"},{"id":"asc"}]')
    );
    expect(stub.getQueryResultWithPagination).not.toHaveBeenCalled();
    expect(result.docs).toEqual([{ id: "row-1", foo: "bar" }]);
  });

  it("attaches the generated id index for private audit queries", async () => {
    const adapter = new FabricContractAdapter(
      undefined as any,
      `adapter-${Math.random().toString(36).slice(2)}`
    );
    const context = createContext({
      getIDBytes: jest.fn().mockReturnValue(Buffer.from("id")),
      getAttributeValue: jest.fn().mockReturnValue(undefined),
      getID: jest.fn().mockReturnValue("client"),
    } as ClientIdentity);

    const iterator = {
      next: jest
        .fn()
        .mockResolvedValueOnce({
          value: {
            value: Buffer.from(JSON.stringify({ id: "row-1", foo: "bar" })),
          },
          done: false,
        })
        .mockResolvedValue({ done: true }),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    const stub = {
      getPrivateDataQueryResult: jest.fn().mockResolvedValue({
        iterator,
      }),
      getQueryResultWithPagination: jest.fn(),
      getQueryResult: jest.fn(),
      getTxID: jest.fn().mockReturnValue("tx-1"),
    } as unknown as ChaincodeStub;

    context.accumulate({ stub } as any);

    const proxy = adapter.forPrivate("private-collection");
    const result = await (proxy as any).raw(
      {
        selector: {
          "??table": "audit",
          id: { $gt: null },
        },
        sort: [{ id: "asc" }],
        limit: 1,
      },
      false,
      true,
      context
    );

    expect(stub.getPrivateDataQueryResult).toHaveBeenCalledWith(
      "private-collection",
      expect.stringContaining(
        '"use_index":["audit_id_asc_index","audit_id_asc_index"]'
      )
    );
    expect(result.docs).toEqual([{ id: "row-1", foo: "bar" }]);
  });

  it("normalizes redundant null-lower-bound sort markers before executing private paginated queries", async () => {
    const adapter = new FabricContractAdapter(
      undefined as any,
      `adapter-${Math.random().toString(36).slice(2)}`
    );
    const context = createContext({
      getIDBytes: jest.fn().mockReturnValue(Buffer.from("id")),
      getAttributeValue: jest.fn().mockReturnValue(undefined),
      getID: jest.fn().mockReturnValue("client"),
    } as ClientIdentity);

    const iterator = {
      next: jest
        .fn()
        .mockResolvedValueOnce({
          value: {
            value: Buffer.from(JSON.stringify({ id: "row-1", model: "Product" })),
          },
          done: false,
        })
        .mockResolvedValue({ done: true }),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    const stub = {
      getPrivateDataQueryResult: jest.fn().mockResolvedValue({
        iterator,
      }),
      getQueryResultWithPagination: jest.fn(),
      getQueryResult: jest.fn(),
      getTxID: jest.fn().mockReturnValue("tx-1"),
    } as unknown as ChaincodeStub;

    context.accumulate({ stub } as any);

    const proxy = adapter.forPrivate("private-collection");
    const result = await (proxy as any).raw(
      {
        selector: {
          $and: [
            { model: { $gte: "Pro", $lt: "Prp" } },
            { "??table": { $eq: "audit" } },
          ],
          model: { $gt: null },
        },
        sort: [{ model: "asc" }, { id: "asc" }],
        use_index: "audit_model_defaultQuery_asc_index",
        limit: 5,
      },
      false,
      true,
      context
    );

    expect(stub.getPrivateDataQueryResult).toHaveBeenCalledWith(
      "private-collection",
      expect.stringContaining('"sort":[{"model":"asc"},{"id":"asc"}]')
    );
    expect(stub.getPrivateDataQueryResult).toHaveBeenCalledWith(
      "private-collection",
      expect.not.stringContaining('"model":{"$gt":null}')
    );
    expect(result.docs).toEqual([{ id: "row-1", model: "Product" }]);
  });
});
