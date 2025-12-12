import { FabricContractAdapter } from "../ContractAdapter";
import { Context, Contract, Context as Ctx } from "fabric-contract-api";
import { Model, Serializer } from "@decaf-ts/decorator-validation";
import {
  ContextualizedArgs,
  LoggerOf,
  OrderDirection,
  Repository,
} from "@decaf-ts/core";
import { FabricContractRepository } from "../FabricContractRepository";
import { DeterministicSerializer } from "../../shared/DeterministicSerializer";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import { Checkable, healthcheck } from "../../shared/interfaces/Checkable";
import { Constructor } from "@decaf-ts/decoration";
import { FabricContractContext } from "../ContractContext";
import {
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
  PrimaryKeyType,
} from "@decaf-ts/db-decorators";
import { ChaincodeStub, ClientIdentity } from "fabric-shim-api";
import { ContractLogger } from "../logging";

/**
 * @description Base contract class for CRUD operations in Fabric chaincode
 * @summary Provides standard create, read, update, and delete operations for models in Fabric chaincode
 * @template M - Type extending Model
 * @class FabricCrudContract
 * @extends {Contract}
 * @example
 * ```typescript
 * // Define a model
 * @table('assets')
 * class Asset extends Model {
 *   @id()
 *   id: string;
 *
 *   @property()
 *   data: string;
 * }
 *
 * // Create a contract that extends FabricCrudContract
 * export class AssetContract extends FabricCrudContract<Asset> {
 *   constructor() {
 *     super('AssetContract', Asset);
 *   }
 *
 *   // Add custom methods as needed
 *   async getAssetHistory(ctx: Context, id: string): Promise<any[]> {
 *     // Custom implementation
 *   }
 * }
 * ```
 * @mermaid
 * sequenceDiagram
 *   participant Client
 *   participant Contract
 *   participant Repository
 *   participant Adapter
 *   participant StateDB
 *
 *   Client->>Contract: create(ctx, model)
 *   Contract->>Repository: repository(ctx)
 *   Contract->>Repository: create(model, ctx)
 *   Repository->>Adapter: create(tableName, id, record, transient, ctx)
 *   Adapter->>StateDB: putState(id, serializedData)
 *   StateDB-->>Adapter: Success
 *   Adapter-->>Repository: record
 *   Repository-->>Contract: model
 *   Contract-->>Client: model
 */
export abstract class FabricCrudContract<M extends Model>
  extends Contract
  implements Checkable
{
  /**
   * @description Shared adapter instance for all contract instances
   */
  protected static adapter: FabricContractAdapter = new FabricContractAdapter();

  protected readonly repo: FabricContractRepository<M>;

  protected static readonly serializer = new DeterministicSerializer();

  protected initialized: boolean = false;

  /**
   * @description Creates a new FabricCrudContract instance
   * @summary Initializes a contract with a name and model class
   * @param {string} name - The name of the contract
   * @param {Constructor<M>} clazz - The model constructor
   */
  protected constructor(
    name: string,
    protected readonly clazz: Constructor<M>
  ) {
    super(name);
    this.repo = Repository.forModel(clazz);
  }

  async listBy(
    ctx: Ctx | FabricContractContext,
    key: keyof M,
    order: string,
    ...args: any[]
  ) {
    const { ctxArgs } = await this.logCtx([...args, ctx], this.listBy);
    return this.repo.listBy(key, order as OrderDirection, ...ctxArgs);
  }

  async paginateBy(
    ctx: Ctx | FabricContractContext,
    key: keyof M,
    order: string,
    size: number,
    ...args: any[]
  ) {
    const { ctxArgs } = await this.logCtx([...args, ctx], this.paginateBy);
    return this.repo.paginateBy(key, order as any, size, ...ctxArgs);
  }

  async findOneBy(
    ctx: Ctx | FabricContractContext,
    key: keyof M,
    value: any,
    ...args: any[]
  ) {
    const { ctxArgs } = await this.logCtx([...args, ctx], this.findOneBy);
    return this.repo.findOneBy(key, value, ...ctxArgs);
  }

  async statement(
    ctx: Ctx | FabricContractContext,
    method: string,
    ...args: any[]
  ) {
    const { ctxArgs } = await this.logCtx([...args, ctx], this.statement);
    return this.repo.statement(method, ...ctxArgs);
  }

  /**
   * @description Creates a single model in the state database
   * @summary Delegates to the repository's create method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {M} model - The model to create
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M>} Promise resolving to the created model
   */
  async create(
    ctx: Ctx | FabricContractContext,
    model: string | M,
    ...args: any[]
  ): Promise<string | M> {
    const { log, ctxArgs } = await this.logCtx([...args, ctx], this.create);
    log.info(`CONTRACT CREATE, ${ctxArgs}`);

    if (typeof model === "string") model = this.deserialize<M>(model) as M;

    log.info(`Creating model: ${JSON.stringify(model)}`);

    const transient = this.getTransientData(ctx);

    log.info(`Merging transient data...`);
    model = Model.merge(model, transient, this.clazz) as M;

    return this.repo.create(model, ...ctxArgs);
  }

  /**
   * @description Reads a single model from the state database
   * @summary Delegates to the repository's read method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {string | number} key - The key of the model to read
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M>} Promise resolving to the retrieved model
   */
  async read(
    ctx: Ctx | FabricContractContext,
    key: PrimaryKeyType | string,
    ...args: any[]
  ): Promise<M | string> {
    const { log, ctxArgs } = await this.logCtx([...args, ctx], this.read);

    log.info(`reading entry with pk ${key} `);

    return this.repo.read(key, ...ctxArgs);
  }

  protected getTransientData(ctx: Ctx | FabricContractContext): any {
    const transientMap = ctx.stub.getTransient();
    let transient: any = {};

    if (transientMap.has((this.repo as any).tableName)) {
      transient = JSON.parse(
        (transientMap.get((this.repo as any).tableName) as Buffer)?.toString(
          "utf8"
        ) as string
      );
    }

    return transient;
  }

  /**
   * @description Updates a single model in the state database
   * @summary Delegates to the repository's update method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {M} model - The model to update
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M>} Promise resolving to the updated model
   */
  async update(
    ctx: Ctx | FabricContractContext,
    model: string | M,
    ...args: any[]
  ): Promise<string | M> {
    const { log, ctxArgs } = await this.logCtx([...args, ctx], this.update);

    if (typeof model === "string") model = this.deserialize<M>(model) as M;

    log.info(`Updating model: ${JSON.stringify(model)}`);

    const transient = this.getTransientData(ctx);

    log.info(`Merging transient data...`);
    model = Model.merge(model, transient, this.clazz) as M;
    return this.repo.update(model, ...ctxArgs);
  }

  /**
   * @description Deletes a single model from the state database
   * @summary Delegates to the repository's delete method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {string | number} key - The key of the model to delete
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M>} Promise resolving to the deleted model
   */
  async delete(
    ctx: Ctx | FabricContractContext,
    key: PrimaryKeyType | string,
    ...args: any[]
  ): Promise<M | string> {
    const { log, ctxArgs } = await this.logCtx([...args, ctx], this.delete);
    log.info(`deleting entry with pk ${key} `);
    return this.repo.delete(String(key), ...ctxArgs);
  }

  /**
   * @description Deletes multiple models from the state database
   * @summary Delegates to the repository's deleteAll method
   * @param {string[] | number[]} keys - The keys of the models to delete
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M[]>} Promise resolving to the deleted models
   */
  async deleteAll(
    ctx: Ctx | FabricContractContext,
    keys: PrimaryKeyType[] | string,
    ...args: any[]
  ): Promise<M[] | string> {
    const { ctxArgs } = await this.logCtx([...args, ctx], this.readAll);
    if (typeof keys === "string") keys = JSON.parse(keys) as string[];
    return this.repo.deleteAll(keys, ...ctxArgs);
  }

  /**
   * @description Reads multiple models from the state database
   * @summary Delegates to the repository's readAll method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {string[] | number[]} keys - The keys of the models to read
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M[]>} Promise resolving to the retrieved models
   */
  async readAll(
    ctx: Ctx | FabricContractContext,
    keys: PrimaryKeyType[] | string,
    ...args: any[]
  ): Promise<M[] | string> {
    const { ctxArgs } = await this.logCtx([...args, ctx], this.readAll);
    if (typeof keys === "string") keys = JSON.parse(keys) as string[];
    return this.repo.readAll(keys, ...ctxArgs);
  }

  /**
   * @description Updates multiple models in the state database
   * @summary Delegates to the repository's updateAll method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {M[]} models - The models to update
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M[]>} Promise resolving to the updated models
   */
  async updateAll(
    ctx: Ctx | FabricContractContext,
    models: string | M[],
    ...args: any[]
  ): Promise<string | M[]> {
    const { log, ctxArgs } = await this.logCtx([...args, ctx], this.updateAll);
    if (typeof models === "string")
      models = (JSON.parse(models) as [])
        .map((m) => this.deserialize(m))
        .map((m) => new this.clazz(m)) as any;

    log.info(`updating ${models.length} entries to the table`);
    return this.repo.updateAll(models as unknown as M[], ...ctxArgs);
  }

  /**
   * @description Executes a raw query against the state database
   * @summary Delegates to the repository's raw method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {any} rawInput - The query to execute
   * @param {boolean} docsOnly - Whether to return only documents
   * @param {...any[]} args - Additional arguments
   * @return {Promise<any>} Promise resolving to the query results
   */
  async raw(
    ctx: Ctx | FabricContractContext,
    rawInput: MangoQuery | string,
    docsOnly: boolean,
    ...args: any[]
  ): Promise<any | string> {
    const { ctxArgs } = await this.logCtx([...args, ctx], this.raw);
    if (typeof rawInput === "string")
      rawInput = JSON.parse(rawInput) as MangoQuery;
    return FabricCrudContract.adapter.raw(rawInput, docsOnly, ...ctxArgs);
  }

  protected serialize(model: M): string {
    return FabricCrudContract.serializer.serialize(model);
  }

  protected deserialize<M extends Model>(str: string): M {
    return (
      FabricCrudContract.serializer as unknown as Serializer<M>
    ).deserialize(str);
  }

  protected async init(ctx: Ctx | FabricContractContext): Promise<void> {
    const LOG = (ctx as Ctx).logging.getLogger("tst");
    LOG.info("in init");
    const { log } = await this.logCtx([ctx], this.init);
    log.info(`Running contract ${this.getName()} initialization...`);
    this.initialized = true;
    log.info(`Contract initialization completed.`);
  }

  async healthcheck(
    ctx: Ctx | FabricContractContext
  ): Promise<string | healthcheck> {
    const LOG = (ctx as Ctx).logging.getLogger("test");
    LOG.info("in healthcheck");
    const { log } = await this.logCtx([ctx], this.healthcheck);
    log.info(`Running Healthcheck: ${this.initialized}...`);
    return { healthcheck: this.initialized };
  }

  /**
   * @description Creates multiple models in the state database
   * @summary Delegates to the repository's createAll method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {M[]} models - The models to create
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M[]>} Promise resolving to the created models
   */
  async createAll(
    ctx: Ctx | FabricContractContext,
    models: string | M[],
    ...args: any[]
  ): Promise<string | M[]> {
    const { log } = await this.logCtx([...args, ctx], this.createAll);

    if (typeof models === "string")
      models = (JSON.parse(models) as [])
        .map((m) => this.deserialize(m))
        .map((m) => new this.clazz(m)) as any;

    log.info(`adding ${models.length} entries to the table`);
    return this.repo.createAll(models as unknown as M[], ctx, ...args);
  }

  async logCtx<ARGS extends any[]>(
    args: ARGS,
    method: ((...args: any[]) => any) | string
  ): Promise<
    ContextualizedArgs<FabricContractContext, ARGS> & {
      stub: ChaincodeStub;
      identity: ClientIdentity;
    }
  > {
    return FabricCrudContract.logCtx.bind(this)(args, method as any);
  }

  protected static async logCtx<ARGS extends any[]>(
    this: any,
    args: ARGS,
    method: string
  ): Promise<
    ContextualizedArgs<FabricContractContext, ARGS> & {
      stub: ChaincodeStub;
      identity: ClientIdentity;
    }
  >;
  protected static async logCtx<ARGS extends any[]>(
    this: any,
    args: ARGS,
    method: (...args: any[]) => any
  ): Promise<
    ContextualizedArgs<FabricContractContext, ARGS> & {
      stub: ChaincodeStub;
      identity: ClientIdentity;
    }
  >;
  protected static async logCtx<ARGS extends any[]>(
    this: any,
    args: ARGS,
    method: ((...args: any[]) => any) | string
  ): Promise<
    ContextualizedArgs<FabricContractContext, ARGS> & {
      stub: ChaincodeStub;
      identity: ClientIdentity;
    }
  > {
    if (args.length < 1) throw new InternalError("No context provided");
    const ctx = args.pop() as FabricContractContext | Context;
    if (ctx instanceof FabricContractContext)
      return {
        ctx,
        log: ctx.logger.clear().for(this).for(method),
        ctxArgs: [...args, ctx],
        stub: ctx.stub,
        identity: ctx.identity,
      };

    if (!(ctx instanceof Context))
      throw new InternalError("No valid context provided");

    const LOG = ctx.logging.getLogger();
    function getOp() {
      LOG.info(
        `Getting op for ${typeof method === "string" ? method : method.name}`
      );
      if (typeof method === "string") return method;
      switch (method.name) {
        case OperationKeys.CREATE:
        case OperationKeys.READ:
        case OperationKeys.UPDATE:
        case OperationKeys.DELETE:
        case BulkCrudOperationKeys.CREATE_ALL:
        case BulkCrudOperationKeys.READ_ALL:
        case BulkCrudOperationKeys.UPDATE_ALL:
        case BulkCrudOperationKeys.DELETE_ALL:
          return method.name;
        default:
          return method.name;
      }
    }

    const overrides = {
      correlationId: ctx.stub.getTxID(),
    };
    LOG.info(`Getting context with ${Object.keys(overrides)} and ctx`);
    const context = await FabricCrudContract.adapter.context(
      getOp(),
      overrides as any,
      this.clazz,
      ctx
    );
    LOG.info(
      `retrieve ctx: stub: ${!!context.stub}, identity: ${!!context.identity}, logger: ${context.logger instanceof ContractLogger}`
    );
    const log = (
      this
        ? context.logger.for(this).for(method)
        : context.logger.clear().for(this).for(method)
    ) as LoggerOf<FabricContractContext>;
    return {
      ctx: context,
      log: log,
      stub: context.stub,
      identity: context.identity,
      ctxArgs: [...args, context],
    };
  }
}
