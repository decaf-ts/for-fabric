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
  override async create(ctx: Ctx, model: string): Promise<string> {
    return this.serialize((await super.create(ctx as any, model)) as M);
  }

  @Transaction(false)
  override async read(ctx: Ctx, key: string): Promise<string> {
    return this.serialize((await super.read(ctx as any, key)) as M);
  }

  @Transaction()
  override async update(ctx: Ctx, model: string): Promise<string> {
    return this.serialize((await super.update(ctx, model)) as M);
  }

  @Transaction()
  override async delete(ctx: Ctx, key: string): Promise<string> {
    return this.serialize((await super.delete(ctx as any, key)) as M);
  }

  @Transaction()
  override async deleteAll(ctx: Ctx, keys: string): Promise<string> {
    const parsedKeys: string[] = JSON.parse(keys);
    return JSON.stringify(
      ((await super.deleteAll(ctx as any, parsedKeys)) as M[]).map(
        (m) => this.serialize(m) as string
      )
    );
  }

  @Transaction(false)
  override async readAll(ctx: Ctx, keys: string): Promise<string> {
    const parsedKeys: string[] = JSON.parse(keys);
    return JSON.stringify(
      ((await super.readAll(ctx as any, parsedKeys)) as M[]).map((m) =>
        this.serialize(m)
      )
    );
  }

  @Transaction()
  override async updateAll(ctx: Ctx, models: string): Promise<string> {
    const list: string[] = JSON.parse(models);
    const modelList: M[] = list
      .map((m) => this.deserialize(m))
      .map((m) => new this.clazz(m));

    return JSON.stringify(
      ((await super.updateAll(ctx as any, modelList)) as M[]).map(
        (m) => this.serialize(m) as string
      )
    );
  }

  @Transaction(false)
  override async statement(ctx: Ctx, method: string, args: string) {
    try {
      args = JSON.parse(args);
    } catch (e: unknown) {
      throw new SerializationError(`Invalid args: ${e}`);
    }
    if (!Array.isArray(args))
      throw new SerializationError(
        `Invalid args: ${JSON.stringify(args)}. must be an array`
      );
    return JSON.stringify(await super.statement(ctx, method, ...args));
  }

  @Transaction(false)
  override async listBy(ctx: Ctx, key: string, order: string) {
    return JSON.stringify(
      await super.listBy(ctx, key as keyof M, order as OrderDirection)
    );
  }

  @Transaction(false)
  override async paginateBy(
    ctx: Ctx,
    key: string,
    order: string,
    ref: string
  ): Promise<string> {
    try {
      ref = JSON.parse(ref);
    } catch (e: unknown) {
      throw new SerializationError(
        `Failed to deserialize paginateBy reference: ${e}`
      );
    }
    return JSON.stringify(
      await super.paginateBy(ctx, key, order as any, ref as any)
    );
  }

  @Transaction(false)
  override async findOneBy(ctx: Ctx, key: string, value: string) {
    return JSON.stringify(await super.findOneBy(ctx, key, value));
  }

  // @Transaction(false)
  override async query(
    ctx: Ctx,
    condition: string,
    orderBy: string,
    order: string,
    limit?: number,
    skip?: number
  ): Promise<string> {
    let cond: Condition<any>;
    try {
      cond = Condition.from(JSON.parse(condition));
    } catch (e: unknown) {
      throw new SerializationError(`Invalid condition: ${e}`);
    }

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
  override async healthcheck(ctx: Ctx): Promise<string> {
    //TODO: TRIM NOT WORKING CHECK LATER
    return JSON.stringify(await super.healthcheck(ctx as any));
  }

  @Transaction()
  override async createAll(context: Ctx, models: string): Promise<string> {
    const list: string[] = JSON.parse(models);
    const modelList: M[] = list
      .map((m) => this.deserialize(m))
      .map((m) => new this.clazz(m));

    const result = (await super.createAll(context, modelList)) as M[];
    return JSON.stringify(result.map((m) => this.serialize(m) as string));
  }
}
