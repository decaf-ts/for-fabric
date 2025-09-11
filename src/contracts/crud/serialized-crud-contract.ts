import { FabricCrudContract } from "./crud-contract";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import { Context, Context as Ctx, Transaction } from "fabric-contract-api";
import { ContractLogger } from "../logging";
import { Logging } from "@decaf-ts/logging";

export class SerializedCrudContract<
  M extends Model,
> extends FabricCrudContract<M> {
  constructor(name: string, clazz: Constructor<M>) {
    super(name, clazz);
  }

  /**
   * @description Creates a logger for a specific chaincode context
   * @summary Returns a ContractLogger instance configured for the current context
   * @param {Ctx} ctx - The Fabric chaincode context
   * @return {ContractLogger} The logger instance
   */
  public override logFor(ctx: Context): ContractLogger {
    return Logging.for(SerializedCrudContract, {}, ctx) as ContractLogger;
  }

  @Transaction()
  override async create(ctx: Ctx, model: string): Promise<string> {
    const log = this.logFor(ctx).for(this.create);
    log.info(`Creating model: ${model}`);

    const m = this.deserialize<M>(model);

    log.info(`Model deserialized: ${JSON.stringify(m)}`);
    return this.serialize((await super.create(ctx, m)) as M);
  }

  @Transaction()
  override async deleteAll(ctx: Ctx, keys: string): Promise<string> {
    const parsedKeys: string[] = JSON.parse(keys);
    const log = this.logFor(ctx).for(this.deleteAll);

    log.info(`deleting ${parsedKeys.length} entries from the table`);

    return JSON.stringify(
      ((await super.deleteAll(ctx, parsedKeys)) as M[]).map(
        (m) => this.serialize(m) as string
      )
    );
  }

  @Transaction(false)
  override async readAll(ctx: Ctx, keys: string): Promise<string> {
    const parsedKeys: string[] = JSON.parse(keys);

    const log = this.logFor(ctx).for(this.readAll);
    log.info(`reading ${parsedKeys.length} entries from the table`);

    return JSON.stringify(
      ((await super.readAll(ctx, parsedKeys)) as M[]).map((m) =>
        this.serialize(m)
      )
    );
  }

  @Transaction()
  override async updateAll(ctx: Ctx, models: string): Promise<string> {
    const log = this.logFor(ctx).for(this.updateAll);
    const list: string[] = JSON.parse(models);
    const modelList: M[] = list
      .map((m) => this.deserialize(m))
      .map((m) => new this.clazz(m));

    log.info(`Updating ${modelList.length} entries to the table`);
    return JSON.stringify(
      ((await super.updateAll(ctx, modelList)) as M[]).map(
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
  override async createAll(ctx: Ctx, models: string): Promise<string> {
    const log = this.logFor(ctx).for(this.createAll);
    const list: string[] = JSON.parse(models);
    const modelList: M[] = list
      .map((m) => this.deserialize(m))
      .map((m) => new this.clazz(m));

    log.info(`Adding ${modelList.length} entries to the table`);
    return JSON.stringify(
      ((await super.createAll(ctx, modelList)) as M[]).map(
        (m) => this.serialize(m) as string
      )
    );
  }

  @Transaction(false)
  override async read(ctx: Ctx, key: string): Promise<string> {
    const log = this.logFor(ctx).for(this.read);
    log.info(`Reading id: ${key}`);
    return this.serialize((await super.read(ctx, key)) as M);
  }

  @Transaction()
  override async update(ctx: Ctx, model: string): Promise<string> {
    const log = this.logFor(ctx).for(this.update);
    log.info(`Updating model: ${model}`);
    return this.serialize((await super.update(ctx, model)) as M);
  }

  @Transaction()
  override async delete(ctx: Ctx, key: string): Promise<string> {
    const log = this.logFor(ctx).for(this.delete);
    log.info(`Deleting id: ${key}`);
    return this.serialize((await super.delete(ctx, key)) as M);
  }
}
