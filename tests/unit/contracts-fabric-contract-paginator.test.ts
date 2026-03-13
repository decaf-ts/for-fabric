import "reflect-metadata";

import { CouchDBKeys, MangoQuery } from "@decaf-ts/for-couchdb";
import { FabricContractPaginator } from "../../src/contracts/FabricContractPaginator";
import { FabricContractAdapter } from "../../src/contracts/ContractAdapter";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import { model, Model } from "@decaf-ts/decorator-validation";
import { pk, table } from "@decaf-ts/core";
import { getIdentityMock, getStubMock } from "./ContextMock";

@table("paginator_model")
@model()
class PaginatorModel extends Model<boolean> {
  @pk()
  id!: string;
}

function buildContext(nativeIndexing = false) {
  const ctx = new FabricContractContext();
  const stub = getStubMock();
  const logger = {
    for: () => logger,
    clear: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  ctx.accumulate({
    stub,
    identity: getIdentityMock(),
    logger,
  } as any);
  if (nativeIndexing) ctx.put("nativeIndexing", true);
  return { ctx, stub };
}

function createAdapter(alias: string) {
  return new FabricContractAdapter(undefined as any, alias);
}

describe("FabricContractPaginator", () => {
  const tableName = Model.tableName(PaginatorModel);
  const baseQuery: MangoQuery = {
    selector: { [CouchDBKeys.TABLE]: tableName },
  };

  it("falls back to mango counting when native indexing is disabled", async () => {
    const adapter = createAdapter("paginator-mango");
    adapter.revert = jest.fn((doc: any) => doc);
    const { ctx } = buildContext(false);
    const paginator = new FabricContractPaginator(
      adapter,
      baseQuery,
      2,
      PaginatorModel
    );
    const docs = [
      { _id: "paginator_model__1", id: "1" },
      { _id: "paginator_model__2", id: "2" },
    ];
    const rawSpy = jest
      .spyOn(adapter, "raw")
      .mockResolvedValueOnce(docs as any)
      .mockResolvedValueOnce({ docs, bookmark: "next" } as any);

    const result = await paginator.page(1, undefined, ctx);

    expect(rawSpy).toHaveBeenCalledTimes(2);
    expect(rawSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ limit: Number.MAX_SAFE_INTEGER }),
      true,
      ctx
    );
    expect(rawSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ limit: paginator["size"] }),
      false,
      ctx
    );
    expect(result).toEqual(docs);
  });

  it("counts results via native range queries when native indexing is enabled", async () => {
    const adapter = createAdapter("paginator-native");
    adapter.revert = jest.fn((doc: any) => doc);
    const { ctx, stub } = buildContext(true);
    const docA = { _id: "paginator_model__A", id: "A" };
    const docB = { _id: "paginator_model__B", id: "B" };
    const compositeA = ctx.stub.createCompositeKey(tableName, ["A"]);
    const compositeB = ctx.stub.createCompositeKey(tableName, ["B"]);
    await stub.putState(compositeA, Buffer.from(JSON.stringify(docA)));
    await stub.putState(compositeB, Buffer.from(JSON.stringify(docB)));
    stub.commit();

    const paginator = new FabricContractPaginator(
      adapter,
      baseQuery,
      2,
      PaginatorModel
    );
    jest.spyOn(adapter, "nativeIndexPlan").mockReturnValue({
      tableName,
      clazz: PaginatorModel as any,
      startkey: `${tableName}${CouchDBKeys.SEPARATOR}`,
      endkey: `${tableName}${CouchDBKeys.SEPARATOR}\ufff0`,
      inclusiveEnd: true,
      descending: false,
      limit: undefined,
      skip: undefined,
    });
    const docs = [docA, docB];
    const rawSpy = jest
      .spyOn(adapter, "raw")
      .mockResolvedValue({ docs, bookmark: "" } as any);

    const result = await paginator.page(1, undefined, ctx);

    expect(rawSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual(docs);
  });
});
