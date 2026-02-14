import "./overrides";
import {
  Repository,
  ObserverHandler,
  EventIds,
  ContextualArgs,
  MaybeContextualArg,
  QueryError,
  PersistenceKeys,
  PreparedStatementKeys,
  OrderDirection,
  SerializedPage,
  Paginator,
  DirectionLimitOffset,
} from "@decaf-ts/core";
import { FabricContractContext } from "./ContractContext";
import { Model } from "@decaf-ts/decorator-validation";
import { FabricContractRepositoryObservableHandler } from "./FabricContractRepositoryObservableHandler";
import {
  BaseError,
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
  PrimaryKeyType,
} from "@decaf-ts/db-decorators";
import { Constructor } from "@decaf-ts/decoration";
import { FabricContractAdapter } from "./ContractAdapter";

/**
 * @description Repository for Hyperledger Fabric chaincode models
 * @summary Provides CRUD operations for models within Fabric chaincode contracts
 * @template M - Type extending Model
 * @template MangoQuery - Query type for CouchDB-like queries
 * @template FabricContractAdapter - Adapter type for Fabric contract operations
 * @template FabricContractFlags - Flags specific to Fabric contract operations
 * @template FabricContractContext - Context type for Fabric contract operations
 *
 * @param {FabricContractAdapter} [adapter] - The adapter for interacting with the state database
 * @param {Constructor<M>} [clazz] - The model constructor
 * @param {Array<OperationKeys | BulkCrudOperationKeys | string>} [trackedEvents] - Events to track for observer notifications
 *
 * @class FabricContractRepository
 * @example
 * ```typescript
 * // In a Fabric chaincode contract class
 * import { FabricContractRepository, FabricContractAdapter } from '@decaf-ts/for-fabric';
 *
 * @table('assets')
 * class Asset extends Model {
 *   @id()
 *   id: string;
 *
 *   @property()
 *   data: string;
 * }
 *
 * export class MyContract extends Contract {
 *   private adapter = new FabricContractAdapter();
 *   private repository: FabricContractRepository<Asset>;
 *
 *   constructor() {
 *     super('MyContract');
 *     this.repository = new FabricContractRepository<Asset>(this.adapter, Asset);
 *   }
 *
 *   @Transaction()
 *   async createAsset(ctx: Context, id: string, data: string): Promise<void> {
 *     const asset = new Asset();
 *     asset.id = id;
 *     asset.data = data;
 *
 *     await this.repository.create(asset, { stub: ctx.stub });
 *   }
 * }
 * ```
 * @mermaid
 * sequenceDiagram
 *   participant Contract
 *   participant Repository
 *   participant Adapter
 *   participant StateDB
 *
 *   Contract->>Repository: create(model, ctx)
 *   Repository->>Adapter: prepare(model, pk)
 *   Repository->>Adapter: create(tableName, id, record, transient, ctx)
 *   Adapter->>StateDB: putState(id, serializedData)
 *   StateDB-->>Adapter: Success
 *   Adapter-->>Repository: record
 *   Repository->>Adapter: revert(record, class, pk, id, transient)
 *   Adapter-->>Repository: model
 *   Repository-->>Contract: model
 */
export class FabricContractRepository<M extends Model> extends Repository<
  M,
  FabricContractAdapter
> {
  protected override _overrides = Object.assign({}, super["_overrides"], {
    ignoreValidation: false,
    ignoreHandlers: false,
    allowRawStatements: true,
    forcePrepareSimpleQueries: false,
    forcePrepareComplexQueries: false,
    rebuildWithTransient: false,
  });

  constructor(
    adapter?: FabricContractAdapter,
    clazz?: Constructor<M>,
    protected trackedEvents?: (OperationKeys | BulkCrudOperationKeys | string)[]
  ) {
    super(adapter, clazz);
  }

  override async create(
    model: M,
    ...args: MaybeContextualArg<FabricContractContext>
  ): Promise<M> {
    const { ctx, log, ctxArgs } = this.logCtx(args, this.create);
    log.debug(
      `Creating new ${this.class.name} in table ${Model.tableName(this.class)}`
    );
    // eslint-disable-next-line prefer-const
    let { record, id, transient, segregated } = this.adapter.prepare(
      model,
      model[this.pk] as any,
      ctx
    );
    if (segregated) ctx.put("segregatedData", segregated);
    record = await this.adapter.create(this.class, id, record, ...ctxArgs);
    return this.adapter.revert<M>(record || {}, this.class, id, transient, ctx);
  }

  override async createAll(
    models: M[],
    ...args: MaybeContextualArg<FabricContractContext>
  ): Promise<M[]> {
    if (!models.length) return models;
    const { ctx, log, ctxArgs } = this.logCtx(args, this.createAll);
    log.debug(
      `Creating ${models.length} new ${this.class.name} in table ${Model.tableName(this.class)}`
    );

    const prepared = models.map((m) => this.adapter.prepare(m, ctx));
    const ids = prepared.map((p) => p.id);
    let records = prepared.map((p) => p.record);
    const segregated = prepared.reduce(
      (acc, p) => {
        const cols = Object.keys(p.segregated || {});
        cols.forEach((c) => {
          acc[c] = acc[c] || {};
          acc[c] = { ...acc[c], ...(p.segregated || {})[c] };
        });
        return acc;
      },
      {} as Record<string, any>
    );
    if (Object.keys(segregated).length) {
      ctx.put("segregatedData", segregated);
    }
    records = await this.adapter.createAll(
      this.class,
      ids as PrimaryKeyType[],
      records,
      ...ctxArgs
    );
    return records.map((r, i) =>
      this.adapter.revert(r, this.class, ids[i], prepared[i].transient, ctx)
    );
  }

  override async update(
    model: M,
    ...args: MaybeContextualArg<FabricContractContext>
  ): Promise<M> {
    const { ctxArgs, log, ctx } = this.logCtx(args, this.update);
    // eslint-disable-next-line prefer-const
    let { record, id, transient, segregated } = this.adapter.prepare(
      model,
      ctx
    );
    log.debug(
      `updating ${this.class.name} in table ${Model.tableName(this.class)} with id ${id}`
    );
    if (segregated) ctx.put("segregatedData", segregated);
    record = await this.adapter.update(this.class, id, record, ...ctxArgs);
    return this.adapter.revert<M>(record, this.class, id, transient, ctx);
  }

  override async updateAll(
    models: M[],
    ...args: MaybeContextualArg<FabricContractContext>
  ): Promise<M[]> {
    const { ctx, log, ctxArgs } = this.logCtx(args, this.updateAll);
    log.verbose(
      `Updating ${models.length} new ${this.class.name} in table ${Model.tableName(this.class)}`
    );

    const prepared = models.map((m) => this.adapter.prepare(m, ctx));
    const ids = prepared.map((p) => p.id);
    const records = prepared.map((p) => p.record);
    const segregated = prepared.reduce(
      (acc, p) => {
        const cols = Object.keys(p.segregated || {});
        cols.forEach((c) => {
          acc[c] = acc[c] || {};
          acc[c] = { ...acc[c], ...(p.segregated || {})[c] };
        });
        return acc;
      },
      {} as Record<string, any>
    );
    if (Object.keys(segregated).length) {
      ctx.put("segregatedData", segregated);
    }

    const updated = await this.adapter.updateAll(
      this.class,
      ids,
      records,
      ...ctxArgs
    );
    return updated.map((u, i) =>
      this.adapter.revert(
        u,
        this.class,
        records[i].id,
        records[i].transient,
        ctx
      )
    );
  }

  override async paginateBy(
    key: keyof M,
    order: OrderDirection,
    ref: Omit<DirectionLimitOffset, "direction"> = {
      offset: 1,
      limit: 10,
    },
    ...args: MaybeContextualArg<FabricContractContext>
  ): Promise<SerializedPage<M>> {
    // eslint-disable-next-line prefer-const
    let { offset, bookmark, limit } = ref;
    if (!offset && !bookmark)
      throw new QueryError(`PaginateBy needs a page or a bookmark`);
    const { log, ctxArgs, ctx } = (
      await this.logCtx(args, PreparedStatementKeys.PAGE_BY, true)
    ).for(this.paginateBy);
    log.verbose(
      `paginating ${Model.tableName(this.class)} with page size ${limit}`
    );

    const segregated = !!ctx.get("segregated");

    let paginator: Paginator<M>;
    if (segregated && bookmark) {
      paginator = await this.override({
        forcePrepareComplexQueries: false,
        forcePrepareSimpleQueries: false,
      } as any)
        .select()
        .where(this.attr(Model.pk(this.class)).gt(bookmark))
        .orderBy([key, order])
        .paginate(limit as number, ...ctxArgs);
    } else if (offset && bookmark) {
      paginator = await this.override({
        forcePrepareComplexQueries: false,
        forcePrepareSimpleQueries: false,
      } as any)
        .select()
        .orderBy([key, order])
        .paginate(limit as number, bookmark, ...ctxArgs);
    } else if (offset) {
      paginator = await this.override({
        forcePrepareComplexQueries: false,
        forcePrepareSimpleQueries: false,
      } as any)
        .select()
        .orderBy([key, order])
        .paginate(limit as number, ...ctxArgs);
    } else {
      throw new QueryError(`PaginateBy needs a page or a bookmark`);
    }
    const paged = await paginator.page(offset, bookmark, ...ctxArgs);
    return paginator.serialize(paged) as SerializedPage<M>;
  }

  override async statement(
    name: string,
    ...args: MaybeContextualArg<FabricContractContext>
  ) {
    const { log, ctx, ctxArgs } = (
      await this.logCtx(args, PersistenceKeys.STATEMENT, true)
    ).for(this.statement);
    if (!Repository.statements(this, name as keyof typeof this))
      throw new QueryError(`Invalid prepared statement requested ${name}`);
    if (ctx.logger) {
      ctx.logger.info(`Repo statement: ${name} + ${args}`);
    }
    log.verbose(`Executing prepared statement ${name} with args ${ctxArgs}`);

    let result: any;
    try {
      result = await (this as any)[name](...ctxArgs);
    } catch (e: unknown) {
      if (e instanceof BaseError) throw e;
      throw new InternalError(
        `Failed to execute prepared statement ${name} with args ${ctxArgs}: ${e}`
      );
    }

    return result;
  }

  /**
   * @description Gets the observer handler for this repository
   * @summary Returns a FabricContractRepositoryObservableHandler instance
   * @return {ObserverHandler} The observer handler
   */
  override ObserverHandler(): ObserverHandler {
    return new FabricContractRepositoryObservableHandler();
  }

  /**
   * @description Updates observers based on tracked events
   * @summary Filters events based on trackedEvents and delegates to the parent method
   * @param {string} table - The table/collection name
   * @param {OperationKeys | BulkCrudOperationKeys | string} event - The event type
   * @param {EventIds} id - The event identifier
   * @param {FabricContractContext} ctx - The Fabric contract context
   * @param {...any[]} args - Additional arguments
   * @return {Promise<void>} Promise that resolves when observers are updated
   */
  override async updateObservers(
    table: Constructor<M> | string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ...args: ContextualArgs<FabricContractContext>
  ): Promise<void> {
    if (!this.trackedEvents || this.trackedEvents.indexOf(event) !== -1)
      return await super.updateObservers(table, event, id, ...args);
  }
}
