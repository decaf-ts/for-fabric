import { Info, Transaction, Context } from "fabric-contract-api";
import { TestModel } from "./TestModel";
@Info({
  title: "TestContract",
  description: "Test implementation of crud contract",
})
export class TestModelContract {
  @Transaction()
  public async createData(
    ctx: Context,
    id: string,
    data: TestModel
  ): Promise<void> {
    ctx.logging
      .getLogger()
      .info(
        `Transaction createData called with id: ${id}, data: ${JSON.stringify(data)}`
      );
    await ctx.stub.putState(id, Buffer.from(JSON.stringify(data)));
  }

  @Transaction(false)
  public async readData(ctx: Context, id: string): Promise<TestModel | null> {
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

    const m = new TestModel(m1);
    ctx.logging
      .getLogger()
      .info(
        `Transaction readData called with id: ${id}: data: ${JSON.stringify(m)}`
      );

    return m;
  }
}
