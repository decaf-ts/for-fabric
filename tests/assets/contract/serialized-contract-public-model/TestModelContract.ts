import { FabricCrudContract } from "../../../../src/contracts/crud/crud-contract";

console.log(
  "Forcing Fabric Crud Contract before models to trigger adaptor decorators override:",
  FabricCrudContract
);
import { Model } from "@decaf-ts/decorator-validation";
import { TestModel } from "./TestModel";
import {
  Info,
  Object as FabricObject,
  Transaction,
  Context,
} from "fabric-contract-api";
import { BaseModel } from "@decaf-ts/core";
import { SerializedCrudContract } from "../../../../src/contracts/crud/serialized-crud-contract";

FabricObject()(Model);
FabricObject()(BaseModel);

@Info({
  title: "TestContract",
  description: "Test implementation of serialized crud contract",
})
export class TestModelContract extends SerializedCrudContract<TestModel> {
  constructor() {
    super(TestModelContract.name, TestModel);
  }

  @Transaction(false)
  public async readByPass(
    ctx: Context,
    id: string,
    collection: string
  ): Promise<string | null> {
    let bytes = undefined;

    if (collection !== "none")
      bytes = await ctx.stub.getPrivateData(collection, id);
    else bytes = await ctx.stub.getState(id);

    if (!bytes || bytes.length === 0) {
      ctx.logging
        .getLogger()
        .info(`Transaction readData called with id: ${id}: No data found`);
      return null;
    }
    const m1 = JSON.parse(bytes.toString());

    ctx.logging
      .getLogger()
      .info(
        `Transaction readData called with id: ${id}: data: ${JSON.stringify(m1)}`
      );

    return JSON.stringify(m1);
  }
}
