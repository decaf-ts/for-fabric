import "../../shared/overrides";
import {
  FabricContextualizedArgs,
  FabricContractAdapter,
} from "../ContractAdapter";
import {
  Context as Ctx,
  Contract,
  Object as FabricObject,
} from "fabric-contract-api";
import { Model, Serializer } from "@decaf-ts/decorator-validation";
import {
  Condition,
  DirectionLimitOffset,
  MaybeContextualArg,
  MethodOrOperation,
  OrderDirection,
  PersistenceKeys,
  PreparedStatementKeys,
  Repository,
  SerializedPage,
} from "@decaf-ts/core";
import { FabricContractRepository } from "../FabricContractRepository";
import { DeterministicSerializer } from "../../shared/DeterministicSerializer";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import { Checkable, healthcheck } from "../../shared/interfaces/Checkable";
import { Constructor } from "@decaf-ts/decoration";
import { FabricContractContext } from "../ContractContext";
import {
  BulkCrudOperationKeys,
  OperationKeys,
  PrimaryKeyType,
} from "@decaf-ts/db-decorators";
import { MissingContextError } from "../../shared/index";

FabricObject()(Date);
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

    // prefixMethod(this);
  }

  async listBy(
    ctx: Ctx | FabricContractContext,
    key: string | keyof M,
    order: string,
    ...args: any[]
  ): Promise<M[] | string> {
    const { ctxArgs, log } = (
      await this.logCtx([...args, ctx], PreparedStatementKeys.LIST_BY, true)
    ).for(this.listBy);
    log.info(
      `Running listBy key ${key as string}, order ${order} and args ${ctxArgs}`
    );
    return this.repo.listBy(
      key as keyof M,
      order as OrderDirection,
      ...ctxArgs
    );
  }

  async paginateBy(
    ctx: Ctx | FabricContractContext,
    key: string | keyof M,
    order: string,
    ref: Omit<DirectionLimitOffset, "direction"> | string = {
      offset: 1,
      limit: 10,
    },
    ...args: any[]
  ): Promise<SerializedPage<M> | string> {
    const { ctxArgs, log } = (
      await this.logCtx([...args, ctx], PreparedStatementKeys.PAGE_BY, true)
    ).for(this.paginateBy);
    log.info(
      `Running paginateBy key ${key as string}, order ${order} with size ${(ref as any).limit} and args ${ctxArgs}`
    );
    return this.repo.paginateBy(
      key as keyof M,
      order as any,
      ref as any,
      ...ctxArgs
    );
  }

  async findOneBy(
    ctx: Ctx | FabricContractContext,
    key: string | keyof M,
    value: any,
    ...args: any[]
  ): Promise<M | string> {
    const { ctxArgs, log } = (
      await this.logCtx([...args, ctx], PreparedStatementKeys.FIND_ONE_BY, true)
    ).for(this.findOneBy);
    log.info(
      `Running findOneBy key ${key as string}, value: ${value} with args ${ctxArgs}`
    );
    return this.repo.findOneBy(key as keyof M, value, ...ctxArgs);
  }

  async statement(
    ctx: Ctx | FabricContractContext,
    method: string,
    ...args: any[]
  ): Promise<any> {
    const { ctxArgs, log } = (
      await this.logCtx([...args, ctx], PersistenceKeys.STATEMENT, true)
    ).for(this.statement);
    log.info(`Running statement ${method} with args ${ctxArgs}`);
    return this.repo.statement(method, ...ctxArgs);
  }

  async countOf(
    ctx: Ctx | FabricContractContext,
    key?: string | keyof M,
    ...args: any[]
  ): Promise<number | string> {
    const { ctxArgs, log } = (
      await this.logCtx([...args, ctx], PreparedStatementKeys.COUNT_OF, true)
    ).for(this.countOf);
    log.info(`Running countOf${key ? ` key ${key as string}` : ""}`);
    return this.repo.countOf(key as keyof M | undefined, ...ctxArgs);
  }

  async maxOf(
    ctx: Ctx | FabricContractContext,
    key: string | keyof M,
    ...args: any[]
  ): Promise<M[keyof M] | string> {
    const { ctxArgs, log } = (
      await this.logCtx([...args, ctx], PreparedStatementKeys.MAX_OF, true)
    ).for(this.maxOf);
    log.info(`Running maxOf key ${key as string}`);
    return this.repo.maxOf(key as keyof M, ...ctxArgs);
  }

  async minOf(
    ctx: Ctx | FabricContractContext,
    key: string | keyof M,
    ...args: any[]
  ): Promise<M[keyof M] | string> {
    const { ctxArgs, log } = (
      await this.logCtx([...args, ctx], PreparedStatementKeys.MIN_OF, true)
    ).for(this.minOf);
    log.info(`Running minOf key ${key as string}`);
    return this.repo.minOf(key as keyof M, ...ctxArgs);
  }

  async avgOf(
    ctx: Ctx | FabricContractContext,
    key: string | keyof M,
    ...args: any[]
  ): Promise<number | string> {
    const { ctxArgs, log } = (
      await this.logCtx([...args, ctx], PreparedStatementKeys.AVG_OF, true)
    ).for(this.avgOf);
    log.info(`Running avgOf key ${key as string}`);
    return this.repo.avgOf(key as keyof M, ...ctxArgs);
  }

  async sumOf(
    ctx: Ctx | FabricContractContext,
    key: string | keyof M,
    ...args: any[]
  ): Promise<number | string> {
    const { ctxArgs, log } = (
      await this.logCtx([...args, ctx], PreparedStatementKeys.SUM_OF, true)
    ).for(this.sumOf);
    log.info(`Running sumOf key ${key as string}`);
    return this.repo.sumOf(key as keyof M, ...ctxArgs);
  }

  async distinctOf(
    ctx: Ctx | FabricContractContext,
    key: string | keyof M,
    ...args: any[]
  ): Promise<M[keyof M][] | string> {
    const { ctxArgs, log } = (
      await this.logCtx([...args, ctx], PreparedStatementKeys.DISTINCT_OF, true)
    ).for(this.distinctOf);
    log.info(`Running distinctOf key ${key as string}`);
    return this.repo.distinctOf(key as keyof M, ...ctxArgs);
  }

  async groupOf(
    ctx: Ctx | FabricContractContext,
    key: string | keyof M,
    ...args: any[]
  ): Promise<Record<string, M[]> | string> {
    const { ctxArgs, log } = (
      await this.logCtx([...args, ctx], PreparedStatementKeys.GROUP_OF, true)
    ).for(this.groupOf);
    log.info(`Running groupOf key ${key as string}`);
    return this.repo.groupOf(key as keyof M, ...ctxArgs);
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
    const { log, ctxArgs } = (
      await this.logCtx([...args, ctx], OperationKeys.CREATE, true)
    ).for(this.create);
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
    const { log, ctxArgs } = (
      await this.logCtx([...args, ctx], OperationKeys.READ, true)
    ).for(this.create);
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
    const { log, ctxArgs } = (
      await this.logCtx([...args, ctx], OperationKeys.UPDATE, true)
    ).for(this.update);
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
    const { log, ctxArgs } = (
      await this.logCtx([...args, ctx], OperationKeys.DELETE, true)
    ).for(this.delete);
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
    const { ctxArgs } = (
      await this.logCtx([...args, ctx], BulkCrudOperationKeys.DELETE_ALL, true)
    ).for(this.deleteAll);
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
    const { ctxArgs } = (
      await this.logCtx([...args, ctx], BulkCrudOperationKeys.READ_ALL, true)
    ).for(this.create);
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
    const { log, ctxArgs } = (
      await this.logCtx([...args, ctx], BulkCrudOperationKeys.UPDATE_ALL, true)
    ).for(this.updateAll);
    if (typeof models === "string")
      models = (JSON.parse(models) as [])
        .map((m) => this.deserialize(m))
        .map((m) => new this.clazz(m)) as any;

    log.info(`updating ${models.length} entries to the table`);
    return this.repo.updateAll(models as unknown as M[], ...ctxArgs);
  }

  /**
   * @description Executes a query with the specified conditions and options.
   * @summary Provides a simplified way to query the database with common query parameters.
   * @param {Condition<M>} condition - The condition to filter records.
   * @param orderBy - The field to order results by.
   * @param {OrderDirection} [order=OrderDirection.ASC] - The sort direction.
   * @param {number} [limit] - Optional maximum number of results to return.
   * @param {number} [skip] - Optional number of results to skip.
   * @return {Promise<M[]>} The query results as model instances.
   */
  async query(
    context: Ctx | FabricContractContext,
    condition: Condition<M> | string,
    orderBy: string | keyof M,
    order: OrderDirection | string = OrderDirection.ASC,
    limit?: number,
    skip?: number,
    ...args: any[]
  ): Promise<M[] | string> {
    const { ctxArgs } = (
      await this.logCtx([...args, context], PersistenceKeys.QUERY, true)
    ).for(this.create);
    return this.repo.query(
      condition as Condition<M>,
      orderBy as keyof M,
      order as OrderDirection,
      limit,
      skip,
      ...ctxArgs
    );
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
    rawInput: MangoQuery,
    docsOnly: boolean,
    ...args: any[]
  ): Promise<any> {
    const { ctxArgs } = (await this.logCtx([...args, ctx], "raw", true)).for(
      this.raw
    );
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
    const { log, ctxArgs } = (
      await this.logCtx([ctx], PersistenceKeys.INITIALIZATION, true)
    ).for(this.init);
    log.info(`Running contract ${this.getName()} initialization...`);
    this.initialized = true;
    log.info(`Contract initialization completed.`);
  }

  async healthcheck(
    ctx: Ctx | FabricContractContext
  ): Promise<string | healthcheck> {
    const { log } = (await this.logCtx([ctx], "healthcheck", true)).for(
      this.healthcheck
    );
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
    const { log, ctxArgs } = (
      await this.logCtx([...args, ctx], BulkCrudOperationKeys.CREATE_ALL, true)
    ).for(this.createAll);
    if (typeof models === "string")
      models = (JSON.parse(models) as [])
        .map((m) => this.deserialize(m))
        .map((m) => new this.clazz(m)) as any;

    log.info(`adding ${models.length} entries to the table`);
    return this.repo.createAll(models as unknown as M[], ...ctxArgs);
  }

  protected logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD
  ): FabricContextualizedArgs<ARGS, METHOD extends string ? true : false>;
  protected logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD,
    allowCreate: false
  ): FabricContextualizedArgs<ARGS, METHOD extends string ? true : false>;
  protected logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD,
    allowCreate: true
  ): Promise<
    FabricContextualizedArgs<ARGS, METHOD extends string ? true : false>
  >;
  protected logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD,
    allowCreate: boolean = false
  ):
    | Promise<
        FabricContextualizedArgs<ARGS, METHOD extends string ? true : false>
      >
    | FabricContextualizedArgs<ARGS, METHOD extends string ? true : false> {
    const ctx = args.pop();
    if (!ctx || !ctx.stub) {
      throw new MissingContextError(`No valid context provided...`);
    }
    const contextualized = FabricCrudContract.adapter["logCtx"](
      [this.clazz as any, ...args] as any,
      operation,
      allowCreate as any,
      ctx
    ) as
      | FabricContextualizedArgs<ARGS, METHOD extends string ? true : false>
      | Promise<
          FabricContextualizedArgs<ARGS, METHOD extends string ? true : false>
        >;
    function squashArgs(ctx: FabricContextualizedArgs) {
      ctx.ctxArgs.shift(); // removes added model to args
      return ctx as any;
    }

    if (!(contextualized instanceof Promise)) return squashArgs(contextualized);
    return contextualized.then(squashArgs);
  }
  //
  // protected static async logCtx<ARGS extends any[]>(
  //   this: any,
  //   args: ARGS,
  //   method: string
  // ): Promise<
  //   ContextualizedArgs<FabricContractContext, ARGS> & {
  //     stub: ChaincodeStub;
  //     identity: ClientIdentity;
  //   }
  // >;
  // protected static async logCtx<ARGS extends any[]>(
  //   this: any,
  //   args: ARGS,
  //   method: (...args: any[]) => any
  // ): Promise<
  //   ContextualizedArgs<FabricContractContext, ARGS> & {
  //     stub: ChaincodeStub;
  //     identity: ClientIdentity;
  //   }
  // >;
  // protected static async logCtx<ARGS extends any[]>(
  //   this: any,
  //   args: ARGS,
  //   method: ((...args: any[]) => any) | string
  // ): Promise<
  //   ContextualizedArgs<FabricContractContext, ARGS> & {
  //     stub: ChaincodeStub;
  //     identity: ClientIdentity;
  //   }
  // > {
  //   if (args.length < 1) throw new InternalError("No context provided");
  //   const ctx = args.pop() as FabricContractContext | Context;
  //   if (ctx instanceof FabricContractContext)
  //     return {
  //       ctx,
  //       log: (
  //         ctx.logger ||
  //         new ContractLogger((this as any)?.name || "Contract", undefined)
  //       )
  //         .clear()
  //         .for(this)
  //         .for(method),
  //       ctxArgs: [...args, ctx],
  //       stub: ctx.stub,
  //       identity: ctx.identity,
  //     };
  //
  //   if (!(ctx instanceof Ctx))
  //     throw new InternalError("No valid context provided");
  //
  //   function getOp() {
  //     if (typeof method === "string") return method;
  //     switch (method.name) {
  //       case OperationKeys.CREATE:
  //       case OperationKeys.READ:
  //       case OperationKeys.UPDATE:
  //       case OperationKeys.DELETE:
  //       case BulkCrudOperationKeys.CREATE_ALL:
  //       case BulkCrudOperationKeys.READ_ALL:
  //       case BulkCrudOperationKeys.UPDATE_ALL:
  //       case BulkCrudOperationKeys.DELETE_ALL:
  //         return method.name;
  //       default:
  //         return method.name;
  //     }
  //   }
  //
  //   const overrides = {
  //     correlationId: ctx.stub.getTxID(),
  //   };
  //   const context = await FabricCrudContract.adapter.context(
  //     getOp(),
  //     overrides as any,
  //     this.clazz,
  //     ctx
  //   );
  //
  //   const baseLogger =
  //     context.logger ||
  //     new ContractLogger((this as any)?.name || "Contract", undefined, ctx);
  //   const log = (
  //     this
  //       ? baseLogger.for(this).for(method)
  //       : baseLogger.clear().for(this).for(method)
  //   ) as LoggerOf<FabricContractContext>;
  //   return {
  //     ctx: context,
  //     log: log,
  //     stub: context.stub,
  //     identity: context.identity,
  //     ctxArgs: [...args, context],
  //   };
  // }
}
