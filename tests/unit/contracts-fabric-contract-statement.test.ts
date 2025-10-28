import "reflect-metadata";

import { FabricStatement } from "../../src/contracts/FabricContractStatement";
import { FabricContractAdapter } from "../../src/contracts/ContractAdapter";
import { FabricContractContext } from "../../src/contracts/ContractContext";
import { model, Model } from "@decaf-ts/decorator-validation";
import { pk, table } from "@decaf-ts/core";
import { CouchDBKeys } from "@decaf-ts/for-couchdb";

@table("parent_model")
@model()
class StatementModel extends Model {
  @pk()
  id!: string;
}

describe("FabricStatement", () => {
  const adapter = new FabricContractAdapter(undefined as any);
  const context = new FabricContractContext();

  it("build constructs mango query with table selector", () => {
    const statement = new FabricStatement(adapter, context);
    const query = statement.select().from(StatementModel).build();

    expect(query.selector).toBeDefined();
    expect(query.selector?.[CouchDBKeys.TABLE]).toBe("StatementModel");
  });

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

    const result = await statement.raw({ selector: {} });

    expect(result).toEqual(rows);
    expect(adapterMock.raw).toHaveBeenCalledWith({ selector: {} }, true, context);
  });
});
