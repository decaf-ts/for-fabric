import "reflect-metadata";

import { FabricStatement } from "../../src/contracts/FabricContractStatement";
import { FabricContractAdapter } from "../../src/contracts/ContractAdapter";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import {
  defaultQueryAttr,
  OrderDirection,
  pk,
  table,
  Condition,
} from "@decaf-ts/core";
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

@table("gtin_statement_model")
@model()
class GtinStatementModel extends Model<boolean> {
  @pk()
  productCode!: string;
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
      { selector: { "??table": "parent_model" } },
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

  it("builds the correct upper bound for an all-9 GTIN prefix", () => {
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
    (statement as any).from(GtinStatementModel);
    (statement as any).where(
      Condition.attribute<GtinStatementModel>("productCode").startsWith(
        "99999999999999"
      )
    );

    const query = (statement as any).build();
    const queue = [query.selector];
    let range: Record<string, any> | undefined;
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      if (
        node.productCode &&
        typeof node.productCode === "object" &&
        (Object.prototype.hasOwnProperty.call(node.productCode, "$gte") ||
          Object.prototype.hasOwnProperty.call(node.productCode, "$lt"))
      ) {
        range = node.productCode;
        break;
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) queue.push(...value);
        else if (value && typeof value === "object") queue.push(value);
      }
    }

    expect(range?.$gte).toBe("99999999999999");
    expect(range?.$lt).toBe("100000000000000");
  });
});
