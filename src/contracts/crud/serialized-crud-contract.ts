import { FabricCrudContract } from "./crud-contract";
import { Model } from "@decaf-ts/decorator-validation";
import { Context as Ctx, Transaction } from "fabric-contract-api";
import { Constructor } from "@decaf-ts/decoration";
import { Condition, OrderDirection } from "@decaf-ts/core";
import { SerializationError } from "@decaf-ts/db-decorators";

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
  override async statement(context: Ctx, method: string, args: string) {
    const { ctx, log } = await this.logCtx([context], this.statement);
    try {
      args = JSON.parse(args);
    } catch (e: unknown) {
      throw new SerializationError(`Invalid args: ${e}`);
    }
    if (!Array.isArray(args))
      throw new SerializationError(
        `Invalid args: ${JSON.stringify(args)}. must be an array`
      );
    log.info(`calling prepared statement ${method}`);
    log.info(`with args ${args}`);
    return JSON.stringify(await super.statement(ctx, method, ...args));
  }

  @Transaction(false)
  override async listBy(context: Ctx, key: string, order: string) {
    const { ctx, log } = await this.logCtx([context], this.listBy);
    log.info(`Executing listBy with key ${key} and order ${order}`);
    return JSON.stringify(
      await super.listBy(ctx, key as keyof M, order as OrderDirection)
    );
  }

  @Transaction(false)
  override async paginateBy(
    context: Ctx,
    key: string,
    order: string,
    size: number
  ) {
    const { ctx, log } = await this.logCtx([context], this.paginateBy);
    log.info(`Executing paginateBy with key ${key} and order ${order}`);
    return JSON.stringify(await super.paginateBy(ctx, key, order as any, size));
  }

  @Transaction(false)
  override async findOneBy(
    context: Ctx,
    key: string,
    value: string,
    ...args: string[]
  ) {
    const { ctx, log } = await this.logCtx([...args, context], this.findOneBy);
    log.info(`Executing findOneBy with key ${key} and value ${value}`);
    return JSON.stringify(await super.findOneBy(ctx, key, value, ...args));
  }

  // @Transaction(false)
  override async query(
    context: Ctx,
    condition: string,
    orderBy: string,
    order: string,
    limit?: number,
    skip?: number
  ): Promise<string> {
    const { ctx, log } = await this.logCtx([context], this.query);

    log.info(`Executing query orderedBy ${orderBy} and order ${order}`);

    let cond: Condition<any>;
    try {
      cond = Condition.from(JSON.parse(condition));
    } catch (e: unknown) {
      throw new SerializationError(`Invalid condition: ${e}`);
    }

    log.info(`Condition: ${JSON.stringify(cond)}`);

    return JSON.stringify(
      await super.query(ctx, cond, orderBy, order as any, limit, skip)
    );
  }
  //
  // // @Transaction(false)
  // override async raw(
  //   context: Ctx,
  //   rawInput: string,
  //   docsOnly: boolean,
  //   ...args: string[]
  // ): Promise<any> {
  //   const { ctx } = await this.logCtx([context], this.raw);
  //   const parsedInput: MangoQuery = JSON.parse(rawInput);
  //   return JSON.stringify(await super.raw(ctx, parsedInput, docsOnly, ...args));
  // }

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
