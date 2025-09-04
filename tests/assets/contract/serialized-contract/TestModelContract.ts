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
import { args } from "./mock-context";
import { OperationKeys } from "@decaf-ts/db-decorators";

@Info({
  title: "TestContract",
  description: "Test implementation of serialized crud contract",
})
export class TestModelContract extends SerializedCrudContract<TestModel> {
  @Transaction()
  public async testCreateContext(
    ctx: Context,
    id: string,
    data: string
  ): Promise<void> {
    data = JSON.parse(data);

    const transformedArgs = await args(
      OperationKeys.CREATE,
      this.repo.class,
      [ctx],
      this.repo["adapter"],
      {}
    );

    let counter = 0;

    // Start by using CTX
    const res1 = await this.runCommand(ctx, ctx, data, id, counter);
    counter++;
    // Use get context to extract fabric CTX
    const ctx1 = this.getContext(transformedArgs);

    // Use For Fabric CTX
    const res2 = await this.runCommand(ctx, ctx1.f, data, id, counter);
    counter++;
    // Use For Fabric CTX 2
    const res3 = await this.runCommand(ctx, ctx1.f1, data, id, counter);
    counter++;
    // Use original CTX Wrapped
    const res4 = await this.runCommand(ctx, ctx1.c, data, id, counter);
    counter++;
    // USE get context on a for fabric CTX
    const transformedArgs1 = await args(
      OperationKeys.CREATE,
      this.repo.class,
      [ctx1.f],
      this.repo["adapter"],
      {}
    );

    const ctx2 = this.getContext(transformedArgs1);

    const res8 = {
      ["tranformArgs1"]:
        transformedArgs1.args.length > 1
          ? "success"
          : "only one arg instead of two",
    };

    // Use For Fabric CTX
    const res5 = await this.runCommand(ctx, ctx2.f, data, id, counter);
    counter++;
    // Use For Fabric CTX 2
    const res6 = await this.runCommand(ctx, ctx2.f1, data, id, counter);
    counter++;
    // Use original CTX Wrapped
    const res7 = await this.runCommand(ctx, ctx2.c, data, id, counter);
    counter++;

    const report = Object.assign(
      {},
      res1,
      res2,
      res3,
      res4,
      res5,
      res6,
      res7,
      res8
    );

    ctx.logging
      .getLogger()
      .info(`Test results: ${JSON.stringify(report, null, 2)}`);
  }

  @Transaction()
  public async testCreateFailContext(
    ctx: Context,
    id: string,
    data: string
  ): Promise<void> {
    data = JSON.parse(data);

    const transformedArgs = await args(
      OperationKeys.CREATE,
      this.repo.class,
      [ctx],
      this.repo["adapter"],
      {}
    );

    let counter = 0;

    //-----------------------------------------------------------------
    // Create all contexts first

    // Use get context to extract fabric CTX
    const ctx1 = this.getContext(transformedArgs);

    // USE get context on a for fabric CTX
    const transformedArgs1 = await args(
      OperationKeys.CREATE,
      this.repo.class,
      [ctx1.f],
      this.repo["adapter"],
      {}
    );

    const ctx2 = this.getContext(transformedArgs1);

    //-----------------------------------------------------------------

    // Start by using CTX
    const res1 = await this.runCommand(ctx, ctx, data, id, counter);
    counter++;

    // Use For Fabric CTX
    const res2 = await this.runCommand(ctx, ctx1.f, data, id, counter);
    counter++;
    // Use For Fabric CTX 2
    const res3 = await this.runCommand(ctx, ctx1.f1, data, id, counter);
    counter++;
    // Use original CTX Wrapped
    const res4 = await this.runCommand(ctx, ctx1.c, data, id, counter);
    counter++;
    const res8 = {
      ["tranformArgs1"]:
        transformedArgs1.args.length > 1
          ? "success"
          : "only one arg instead of two",
    };

    // Use For Fabric CTX
    const res5 = await this.runCommand(ctx, ctx2.f, data, id, counter);
    counter++;
    // Use For Fabric CTX 2
    const res6 = await this.runCommand(ctx, ctx2.f1, data, id, counter);
    counter++;
    // Use original CTX Wrapped
    const res7 = await this.runCommand(ctx, ctx2.c, data, id, counter);
    counter++;
    let res9;
    const currentId = id + counter;
    try {
      await this.repo["adapter"].create(
        "TestModel",
        id + counter,
        data as any,
        {},
        { stub: ctx.stub, logger: ctx1.f.logger }
      );

      res9 = { [currentId]: "success" };
    } catch (err) {
      res9 = { [currentId]: err };
      ctx.logging
        .getLogger()
        .error(
          `Failed to create TestModel with id ${currentId}: ${err.message}`
        );
    }

    const report = Object.assign(
      {},
      res1,
      res2,
      res3,
      res4,
      res5,
      res6,
      res7,
      res8,
      res9
    );

    ctx.logging
      .getLogger()
      .info(`Test results: ${JSON.stringify(report, null, 2)}`);
  }

  @Transaction()
  public async bypassCreate(
    ctx: Context,
    id: string,
    data: string
  ): Promise<void> {
    data = JSON.parse(data);

    await ctx.stub.putState(id, Buffer.from(JSON.stringify(data)));
  }

  @Transaction()
  public async testReadContext(
    ctx: Context,
    id: string
  ): Promise<string | null> {
    const transformedArgs = await args(
      OperationKeys.CREATE,
      this.repo.class,
      [ctx],
      this.repo["adapter"],
      {}
    );

    const id1 = id + "1";
    const id2 = id + "2";
    const id3 = id + "3";
    const id4 = id + "4";

    let bytes2;
    let bytes3;
    let bytes4;

    const fcontext = transformedArgs.context as any;

    const fcontext1 = transformedArgs.args[1] as any;

    const basectx = transformedArgs.args[0] as any;

    try {
      bytes2 = await fcontext.stub.getState(id2);
    } catch (err) {
      ctx.logging
        .getLogger()
        .info(
          `Transaction put state Decaf context called with id: ${id2}, data: ${JSON.stringify(err)}`
        );
    }

    try {
      bytes3 = await fcontext1.stub.getState(id3);
    } catch (err) {
      ctx.logging
        .getLogger()
        .info(
          `Transaction put state Decaf context 1 called with id: ${id3}, data: ${JSON.stringify(err)}`
        );
    }

    try {
      bytes4 = await basectx.stub.getState(id4);
    } catch (err) {
      ctx.logging
        .getLogger()
        .info(
          `Transaction put state base after conversion context 1 called with id: ${id4}, data: ${JSON.stringify(err)}`
        );
    }

    ctx.logging
      .getLogger()
      .info(`Transaction createData called with id: ${id1}`);

    const bytes1 = await ctx.stub.getState(id1);

    let m;

    try {
      const m1 = JSON.parse(bytes1.toString());
      const m2 = JSON.parse(bytes2.toString());
      const m3 = JSON.parse(bytes3.toString());
      const m4 = JSON.parse(bytes4.toString());

      m = {
        m1,
        m2,
        m3,
        m4,
      };
    } catch (e) {
      ctx.logging
        .getLogger()
        .info(
          `Transaction readData called with id: ${id}: error: ${JSON.stringify(e)}`
        );
    }

    return JSON.stringify(m);
  }

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

  public getContext(context) {
    return {
      f: context.context,
      f1: context.args[1],
      c: context.args[0],
    };
  }

  public async runCommand(ctx, context, model, id, counter) {
    const currentId = id + counter;

    if (!context) {
      return { [currentId]: "No context" };
    }

    try {
      await context.stub.putState(
        currentId,
        Buffer.from(JSON.stringify(model))
      );

      ctx.logging
        .getLogger()
        .info(
          `Transaction create called with id: ${currentId}, data: ${JSON.stringify(model)} was successful`
        );

      return { [currentId]: "success" };
    } catch (err) {
      ctx.logging
        .getLogger()
        .info(
          `Transaction create called with id: ${currentId}, data: ${JSON.stringify(model)} failed with error: ${err.message}`
        );
      return { [currentId]: err };
    }
  }

  @Transaction(false)
  public async readByPass(ctx: Context, id: string): Promise<string | null> {
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
}
