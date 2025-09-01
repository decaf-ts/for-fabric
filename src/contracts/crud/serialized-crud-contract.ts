import { FabricCrudContract } from "./crud-contract";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import { Context as Ctx, Transaction } from "fabric-contract-api";

export class SerializedCrudContract<
  M extends Model,
> extends FabricCrudContract<M> {
  constructor(name: string, clazz: Constructor<M>) {
    super(name, clazz);
  }

  @Transaction()
  override async createAll(ctx: Ctx, models: string): Promise<string> {
    const ms = (JSON.parse(models) as []).map((m) => new this.clazz(m));
    return JSON.stringify(
      ((await super.createAll(ctx, ms)) as M[]).map(
        (m) => this.serialize(m) as string
      )
    );
  }

  @Transaction()
  override async delete(ctx: Ctx, key: string): Promise<string> {
    return this.serialize((await super.delete(ctx, key)) as M);
  }

  @Transaction()
  override async deleteAll(ctx: Ctx, keys: string): Promise<string> {
    const parsedKeys: string[] = JSON.parse(keys);

    return JSON.stringify(
      ((await super.deleteAll(ctx, parsedKeys)) as M[]).map(
        (m) => this.serialize(m) as string
      )
    );
  }

  @Transaction(false)
  override async read(ctx: Ctx, key: string): Promise<string> {
    return this.serialize((await super.read(ctx, key)) as M);
  }

  @Transaction(false)
  override async readAll(ctx: Ctx, keys: string): Promise<string> {
    const parsedKeys: string[] = JSON.parse(keys);

    return JSON.stringify(
      ((await super.readAll(ctx, parsedKeys)) as M[]).map((m) =>
        this.serialize(m)
      )
    );
  }

  @Transaction()
  override async update(ctx: Ctx, model: string): Promise<string> {
    return this.serialize((await super.update(ctx, model)) as M);
  }

  @Transaction()
  override async updateAll(ctx: Ctx, models: string): Promise<string> {
    const ms = (JSON.parse(models) as []).map((m) => new this.clazz(m));
    return JSON.stringify(
      ((await super.updateAll(ctx, ms)) as M[]).map(
        (m) => this.serialize(m) as string
      )
    );
  }

  @Transaction(false)
  override async raw(
    ctx: Ctx,
    rawInput: string,
    docsOnly: boolean
  ): Promise<any> {
    const parsedInput: MangoQuery = JSON.parse(rawInput);
    return super.raw(ctx, parsedInput, docsOnly);
  }

  @Transaction()
  override async init(ctx: Ctx): Promise<void> {
    await super.init(ctx);
  }

  @Transaction(false)
  override async healthcheck(ctx: Ctx): Promise<string> {
    //TODO: TRIM NOT WORKING CHECK LATER
    return String(await super.healthcheck(ctx)).trim();
  }

  @Transaction()
  override async create(ctx: Ctx, model: string): Promise<string> {
    const log = SerializedCrudContract.adapter.logFor(ctx).for(this.create);
    log.info(`Creating model: ${model}`);

    const m = this.deserialize<M>(model);

    log.info(`Model deserialized: ${JSON.stringify(m)}`);
    return this.serialize((await super.create(ctx, m)) as M);
  }
}
