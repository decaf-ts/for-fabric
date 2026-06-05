import "reflect-metadata";

import { FabricStatement } from "../../src/contracts/FabricContractStatement";
import { FabricContractAdapter } from "../../src/contracts/ContractAdapter";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import {
  defaultQueryAttr,
  OrderDirection,
  pk,
  table,
} from "@decaf-ts/core";
import { Condition } from "@decaf-ts/core";
import { model, Model } from "@decaf-ts/decorator-validation";

@table("parent_model")
@model()
class StatementModel extends Model<boolean> {
  @pk()
  id!: string;
}

@table("default_query_model")
@model()
class DefaultQueryModel extends Model<boolean> {
  @pk()
  id!: string;

  @defaultQueryAttr()
  name!: string;
}

describe("FabricStatement", () => {
  const context = new FabricContractContext();
  const logger = {
    for: jest.fn().mockReturnThis(),
    clear: jest.fn().mockReturnThis(),
    info: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
  };
  context.accumulate({ logger } as any);

  it("raw maps results through adapter when no field selector", async () => {
    const rows = [{ _id: "1", id: "1" }];
    const adapterMock = {
      raw: jest.fn().mockResolvedValue(rows),
      revert: jest.fn((record: any) => record),
    };
    const statement = new FabricStatement(
      adapterMock as unknown as FabricContractAdapter,
      context
    );
    (statement as any).fromSelector = StatementModel;

    const result = await statement.raw({ selector: {} }, context);

    expect(result).toEqual(rows);
    expect(adapterMock.raw).toHaveBeenCalledWith(
      { selector: {} },
      true,
      context
    );
  });

  it("forces the named default-query index for starts-with queries", () => {
    const adapterMock = {
      raw: jest.fn(),
      revert: jest.fn(),
      log: {
        for: jest.fn().mockReturnThis(),
        info: jest.fn(),
        error: jest.fn(),
        verbose: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        silly: jest.fn(),
      },
    };
    const statement = new FabricStatement(
      adapterMock as unknown as FabricContractAdapter,
      context
    );
    (statement as any)
      .from(DefaultQueryModel)
      .where(Condition.attribute<DefaultQueryModel>("name").startsWith("abc"))
      .orderBy("name", OrderDirection.ASC);

    const query = (statement as any).build();

    expect(query.use_index).toBe(
      ["default_query_model", "name", "defaultQuery", "asc", "index"].join("_")
    );
  });
});
