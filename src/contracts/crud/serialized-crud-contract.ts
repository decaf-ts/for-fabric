import { FabricCrudContract } from "./crud-contract";
import { Model } from "@decaf-ts/decorator-validation";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import { Context as Ctx, Transaction } from "fabric-contract-api";
import { Constructor } from "@decaf-ts/decoration";

/**
 * @description CRUD contract variant that serializes/deserializes payloads
 * @summary Exposes the same CRUD operations as FabricCrudContract but takes and returns JSON strings to facilitate simple client interactions.
 * @template M - Model type handled by this contract
 * @param {string} name - The contract name
 * @param {Constructor<M>} clazz - The model constructor used to instantiate models from JSON
 * @return {void}
 * @class SerializedCrudContract
 * @example
 * const contract = new SerializedCrudContract<MyModel>('MyModelContract', MyModel);
 * // Client submits JSON string payloads and receives JSON string responses
 */
export class SerializedCrudContract<
  M extends Model,
> extends FabricCrudContract<M> {
  constructor(name: string, clazz: Constructor<M>) {
    super(name, clazz);
  }

  @Transaction()
  override async create(context: Ctx, model: string): Promise<string> {
    const { log, ctx } = await this.logCtx([context], this.create);
    log.info(`Creating model: ${model}`);

    const m = this.deserialize<M>(model);

    log.info(`Model deserialized: ${JSON.stringify(m)}`);
    return this.serialize((await super.create(ctx as any, m)) as M);
  }

  @Transaction(false)
  override async read(context: Ctx, key: string): Promise<string> {
    const { log, ctx } = await this.logCtx([context], this.read);
    log.info(`Reading id: ${key}`);
    return this.serialize((await super.read(ctx as any, key)) as M);
  }

  @Transaction()
  override async update(context: Ctx, model: string): Promise<string> {
    const { log, ctx } = await this.logCtx([context], this.update);
    log.info(`Updating model: ${model}`);
    return this.serialize((await super.update(ctx as any, model)) as M);
  }

  @Transaction()
  override async delete(context: Ctx, key: string): Promise<string> {
    const { log, ctx } = await this.logCtx([context], this.delete);
    log.info(`Deleting id: ${key}`);
    return this.serialize((await super.delete(ctx as any, key)) as M);
  }

  @Transaction()
  override async deleteAll(context: Ctx, keys: string): Promise<string> {
    const parsedKeys: string[] = JSON.parse(keys);
    const { log, ctx } = await this.logCtx([context], this.deleteAll);

    log.info(`deleting ${parsedKeys.length} entries from the table`);

    return JSON.stringify(
      ((await super.deleteAll(ctx as any, parsedKeys)) as M[]).map(
        (m) => this.serialize(m) as string
      )
    );
  }

  @Transaction(false)
  override async readAll(context: Ctx, keys: string): Promise<string> {
    const parsedKeys: string[] = JSON.parse(keys);

    const { log, ctx } = await this.logCtx([context], this.readAll);
    log.info(`reading ${parsedKeys.length} entries from the table`);

    return JSON.stringify(
      ((await super.readAll(ctx as any, parsedKeys)) as M[]).map((m) =>
        this.serialize(m)
      )
    );
  }

  @Transaction()
  override async updateAll(context: Ctx, models: string): Promise<string> {
    const { log, ctx } = await this.logCtx([context], this.updateAll);
    const list: string[] = JSON.parse(models);
    const modelList: M[] = list
      .map((m) => this.deserialize(m))
      .map((m) => new this.clazz(m));

    log.info(`Updating ${modelList.length} entries to the table`);
    return JSON.stringify(
      ((await super.updateAll(ctx as any, modelList)) as M[]).map(
        (m) => this.serialize(m) as string
      )
    );
  }

  @Transaction(false)
  override async statement(context: Ctx, method: string) {
    const { ctx } = await this.logCtx([context], this.statement);
    return super.statement(ctx, method);
  }

  @Transaction(false)
  override async raw(
    context: Ctx,
    rawInput: string,
    docsOnly: boolean
  ): Promise<any> {
    const { ctx } = await this.logCtx([context], this.raw);
    const parsedInput: MangoQuery = JSON.parse(rawInput);
    return super.raw(ctx, parsedInput, docsOnly);
  }

  @Transaction()
  override async init(ctx: Ctx): Promise<void> {
    await super.init(ctx);
  }

  @Transaction(false)
  override async healthcheck(context: Ctx): Promise<string> {
    const { log, ctx } = await this.logCtx([context], this.updateAll);
    log.debug(`Running Healthcheck: ${this.initialized}...`);
    //TODO: TRIM NOT WORKING CHECK LATER
    return JSON.stringify(await super.healthcheck(ctx as any));
  }

  @Transaction()
  override async createAll(context: Ctx, models: string): Promise<string> {
    const { log } = await this.logCtx([context], this.createAll);
    const list: string[] = JSON.parse(models);
    const modelList: M[] = list
      .map((m) => this.deserialize(m))
      .map((m) => new this.clazz(m));

    log.info(`Adding ${modelList.length} entries to the table`);
    return JSON.stringify(
      ((await super.createAll(context, modelList)) as M[]).map(
        (m) => this.serialize(m) as string
      )
    );
  }
}
