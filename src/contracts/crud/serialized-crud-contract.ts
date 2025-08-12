import { FabricCrudContract } from "./crud-contract";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { Context as Ctx, Transaction } from "fabric-contract-api";

export class SerializedCrudContract<
  M extends Model,
> extends FabricCrudContract<M> {
  constructor(name: string, clazz: Constructor<M>) {
    super(name, clazz);
  }

  @Transaction()
  override async create(
    ctx: Ctx,
    model: string,
    ...args: any[]
  ): Promise<string> {
    const m = this.deserialize<M>(model);
    return this.serialize((await super.create(ctx, m, ...args)) as M);
  }

  @Transaction()
  override async createAll(
    ctx: Ctx,
    models: string,
    ...args: any[]
  ): Promise<string> {
    const ms = (JSON.parse(models) as []).map((m) => new this.clazz(m));
    return JSON.stringify(
      ((await super.createAll(ctx, ms, ...args)) as M[]).map(
        (m) => this.serialize(m) as string
      )
    );
  }

  @Transaction()
  override async delete(
    ctx: Ctx,
    key: string | number,
    ...args: any[]
  ): Promise<string> {
    return this.serialize((await super.delete(ctx, key, ...args)) as M);
  }

  @Transaction()
  override async deleteAll(
    keys: string[] | number[],
    ctx: Ctx,
    ...args: any[]
  ): Promise<string> {
    return JSON.stringify(
      ((await super.deleteAll(keys, ctx, ...args)) as M[]).map(
        (m) => this.serialize(m) as string
      )
    );
  }

  @Transaction(false)
  override async read(
    ctx: Ctx,
    key: string | number,
    ...args: any[]
  ): Promise<string> {
    return this.serialize((await super.read(ctx, key, ...args)) as M);
  }

  @Transaction(false)
  override async readAll(
    ctx: Ctx,
    keys: string[] | number[],
    ...args: any[]
  ): Promise<string> {
    return JSON.stringify(
      ((await super.readAll(ctx, keys, ...args)) as M[]).map((m) =>
        this.serialize(m)
      )
    );
  }

  @Transaction()
  override async update(ctx: Ctx, model: M, ...args: any[]): Promise<string> {
    return this.serialize((await super.update(ctx, model, ...args)) as M);
  }

  @Transaction()
  override async updateAll(
    ctx: Ctx,
    models: string,
    ...args: any[]
  ): Promise<string> {
    const ms = (JSON.parse(models) as []).map((m) => new this.clazz(m));
    return JSON.stringify(
      ((await super.updateAll(ctx, ms, ...args)) as M[]).map(
        (m) => this.serialize(m) as string
      )
    );
  }

  override async raw(
    ctx: Ctx,
    rawInput: any,
    docsOnly: boolean,
    ...args: any[]
  ): Promise<any> {
    return super.raw(ctx, rawInput, docsOnly, ...args);
  }
}
