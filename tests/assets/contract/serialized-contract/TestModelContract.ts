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
  @Transaction()
  public async createData(
    ctx: Context,
    id: string,
    data: string
  ): Promise<void> {
    data = JSON.parse(data);
    ctx.logging
      .getLogger()
      .info(
        `Transaction createData called with id: ${id}, data: ${JSON.stringify(data)}`
      );
    await ctx.stub.putState(id, Buffer.from(JSON.stringify(data)));
  }

  constructor() {
    super(TestModelContract.name, TestModel);
  }

  @Transaction(false)
  public async readData(ctx: Context, id: string): Promise<string | null> {
    const bytes = await ctx.stub.getState(id);
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

  @Transaction(false)
  public async healthcheck(ctx: Context): Promise<string> {
    return "ready";
  }
}
