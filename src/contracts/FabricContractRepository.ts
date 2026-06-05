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
  MethodOrOperation,
  ContextualizedArgs,
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
import { FabricContractFlags } from "./types";
import {
  applyMirrorFlags,
  applySegregationFlags,
  extractMspId,
} from "../shared/decorators";
import { appendFileSync } from "fs";

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
  private static readonly DEFAULT_QUERY_BOOKMARK_PREFIX =
    "__dcf_dqbm__";

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
    protected omittedEvents?: (OperationKeys | BulkCrudOperationKeys | string)[]
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
      this.adapter.revert(u, this.class, ids[i], prepared[i].transient, ctx)
    );
  }

  override async listBy(
    key: keyof M,
    order: OrderDirection,
    ...args: MaybeContextualArg<FabricContractContext>
  ) {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.LIST_BY, true)
    ).for(this.listBy);
    log.verbose(
      `listing ${Model.tableName(this.class)} by ${key as string} ${order}`
    );
    return this.select()
      .orderBy([key, order])
      .execute(...ctxArgs);
  }

  override async find(
    value: string,
    order: OrderDirection = OrderDirection.ASC,
    ...args: MaybeContextualArg<FabricContractContext>
  ): Promise<M[]> {
    if (typeof value !== "string")
      throw new QueryError("Find value must be a string");
    const attrs = this.getFabricDefaultQueryAttributes();
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.FIND, true)
    ).for(this.find);
    log.verbose(
      `finding ${Model.tableName(this.class)} by default query attributes ${attrs.join(", ")}`
    );

    const results = await Promise.all(
      attrs.map((attr) =>
        this.select()
          .where(this.attr(attr as keyof M).startsWith(value))
          .orderBy([attr as keyof M, order])
          .execute(...ctxArgs)
      )
    );

    const seen = new Set<string>();
    const merged: M[] = [];
    const pk = Model.pk(this.class) as keyof M;
    for (const group of results) {
      for (const record of group || []) {
        const id = String((record as any)[pk] ?? (record as any).id ?? "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        merged.push(record);
      }
    }
    return merged;
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
    ref.offset = ref.offset || 1;
    ref.limit = ref.limit || 10;
    const { offset, bookmark, limit } = ref;
    if (!offset && !bookmark)
      throw new QueryError(`PaginateBy needs a page or a bookmark`);
    const { log, ctxArgs, ctx } = (
      await this.logCtx(args, PreparedStatementKeys.PAGE_BY, true)
    ).for(this.paginateBy);
    log.verbose(
      `paginating ${Model.tableName(this.class)} with page size ${limit}`
    );

    const msp = extractMspId(ctx.identity);
    const { privateCols, sharedCols } = Model.collectionsFor(this.class);
    const collections = [
      ...new Set(
        await Promise.all(
          [...privateCols, ...sharedCols].map((c) =>
            typeof c === "string" ? c : c(this.class, msp, ctx)
          )
        )
      ),
    ];
    applySegregationFlags(new this.class(), collections, ctx);
    await applyMirrorFlags(this.class, msp, ctx);

    let paginator: Paginator<M>;
    if (offset && bookmark) {
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
    const totalCount = await countStoredEntries(ctx, this.class);
    if (typeof totalCount === "number") {
      (paginator as any)._recordCount = totalCount;
      (paginator as any)._totalPages = Math.max(
        1,
        Math.ceil(totalCount / limit)
      );
    }
    const serialization = paginator.serialize(paged) as SerializedPage<M>;
    if (process.env.PAGE_DEBUG) {
      appendFileSync(
        "/tmp/fabric-paginate.log",
        JSON.stringify(
          Object.assign(
            {
              key,
              order,
              ref,
            },
            serialization
          )
        ) + "\n"
      );
    }
    return serialization;
  }

  override async page(
    value: string,
    direction: OrderDirection = OrderDirection.ASC,
    ref: Omit<DirectionLimitOffset, "direction"> = {
      offset: 1,
      limit: 10,
    },
    ...args: MaybeContextualArg<FabricContractContext>
  ): Promise<SerializedPage<M>> {
    if (typeof value !== "string")
      throw new QueryError("Page value must be a string");
    ref.offset = ref.offset || 1;
    ref.limit = ref.limit || 10;
    const attrs = this.getFabricDefaultQueryAttributes();
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.PAGE, true)
    ).for(this.page);
    log.verbose(
      `paging ${Model.tableName(this.class)} by default query attributes ${attrs.join(", ")}`
    );
    log.debug(
      `default query page request value=${value} direction=${direction} ref=${JSON.stringify(ref)} attrs=${JSON.stringify(
        attrs
      )}`
    );

    const decoded = this.decodeDefaultQueryBookmark(ref.bookmark);
    if (decoded) {
      log.debug(
        `decoded default query bookmark attr=${decoded.attr} bookmark=${decoded.bookmark}`
      );
    }
    if (decoded?.attr && attrs.includes(decoded.attr as keyof M)) {
      log.debug(`continuing default query page using attr=${decoded.attr}`);
      const page = await this.pageByDefaultAttr(
        decoded.attr as keyof M,
        value,
        direction,
        { ...ref, bookmark: decoded.bookmark },
        ...ctxArgs
      );
      log.debug(
        `default query page completed for attr=${decoded.attr} count=${page.data.length} bookmark=${page.bookmark}`
      );
      return this.encodeDefaultQueryBookmark(
        decoded.attr as keyof M,
        page.bookmark,
        page
      );
    }

    for (const attr of attrs) {
      log.debug(`trying default query page attr=${String(attr)}`);
      const page = await this.pageByDefaultAttr(
        attr as keyof M,
        value,
        direction,
        ref,
        ...ctxArgs
      );
      log.debug(
        `default query page attr=${String(attr)} returned count=${page.data.length} bookmark=${page.bookmark}`
      );
      if (page.data.length > 0) {
        return this.encodeDefaultQueryBookmark(attr as keyof M, page.bookmark, page);
      }
    }

    return this.encodeDefaultQueryBookmark(
      attrs[0] as keyof M,
      undefined,
      {
        current: ref.offset || 1,
        total: 1,
        count: 0,
        data: [],
        bookmark: undefined,
      }
    );
  }

  private getFabricDefaultQueryAttributes(): (keyof M)[] {
    const attrs = Model.defaultQueryAttributes(this.class);
    if (!attrs || !attrs.length)
      throw new QueryError(
        `No default query attributes defined for ${Model.tableName(this.class)}`
      );
    return attrs as (keyof M)[];
  }

  private async pageByDefaultAttr(
    attr: keyof M,
    value: string,
    direction: OrderDirection,
    ref: Omit<DirectionLimitOffset, "direction">,
    ...args: MaybeContextualArg<FabricContractContext>
  ): Promise<SerializedPage<M>> {
    const limit = ref.limit || 10;
    const bookmark = ref.bookmark;
    const { log } = await this.logCtx(args, PreparedStatementKeys.PAGE, true);
    log.debug(
      `pageByDefaultAttr attr=${String(attr)} value=${value} direction=${direction} limit=${limit} bookmark=${bookmark}`
    );
    const paginator = await this.select()
      .where(this.attr(attr).startsWith(value))
      .orderBy([attr, direction])
      .paginate(limit as number, bookmark as any, ...args);
    const paged = await paginator.page(ref.offset || 1, bookmark as any, ...args);
    const pagedCount = Array.isArray((paged as any)?.data)
      ? (paged as any).data.length
      : Array.isArray(paged)
        ? paged.length
        : undefined;
    log.debug(
      `pageByDefaultAttr attr=${String(attr)} paged count=${String(pagedCount)} paginatorBookmark=${(paginator as any)["_bookmark"]}`
    );
    return paginator.serialize(paged) as SerializedPage<M>;
  }

  private encodeDefaultQueryBookmark(
    attr: keyof M,
    bookmark: string | number | undefined,
    page: SerializedPage<M>
  ): SerializedPage<M> {
    if (!bookmark) return page;
    return Object.assign(page, {
      bookmark: `${FabricContractRepository.DEFAULT_QUERY_BOOKMARK_PREFIX}${Buffer.from(
        JSON.stringify({
          attr: String(attr),
          bookmark,
        })
      ).toString("base64url")}`,
    });
  }

  private decodeDefaultQueryBookmark(
    bookmark: unknown
  ): { attr: string; bookmark?: string } | undefined {
    if (
      typeof bookmark !== "string" ||
      !bookmark.startsWith(
        FabricContractRepository.DEFAULT_QUERY_BOOKMARK_PREFIX
      )
    )
      return undefined;
    try {
      const raw = bookmark.slice(
        FabricContractRepository.DEFAULT_QUERY_BOOKMARK_PREFIX.length
      );
      const parsed = JSON.parse(
        Buffer.from(raw, "base64url").toString("utf8")
      );
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof parsed.attr !== "string"
      )
        return undefined;
      return {
        attr: parsed.attr,
        bookmark:
          typeof parsed.bookmark === "string"
            ? parsed.bookmark
            : undefined,
      };
    } catch {
      return undefined;
    }
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
    if (!this.omittedEvents || !this.omittedEvents.includes(event))
      return await super.updateObservers(table, event, id, ...args);
  }

  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD
  ): ContextualizedArgs<
    FabricContractContext,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD,
    allowCreate: false
  ): ContextualizedArgs<
    FabricContractContext,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD,
    allowCreate: true
  ): Promise<
    ContextualizedArgs<
      FabricContractContext,
      ARGS,
      METHOD extends string ? true : false
    >
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD,
    allowCreate: true,
    overrides?: Partial<FabricContractFlags>
  ): Promise<
    ContextualizedArgs<
      FabricContractContext,
      ARGS,
      METHOD extends string ? true : false
    >
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD,
    allowCreate: false,
    overrides?: Partial<FabricContractFlags>
  ): ContextualizedArgs<
    FabricContractContext,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<FabricContractContext, ARGS>,
    operation: METHOD,
    allowCreate?: boolean,
    overrides?: Partial<FabricContractFlags>
  ):
    | ContextualizedArgs<
        FabricContractContext,
        ARGS,
        METHOD extends string ? true : false
      >
    | Promise<
        ContextualizedArgs<
          FabricContractContext,
          ARGS,
          METHOD extends string ? true : false
        >
      > {
    const result = super.logCtx(args, operation, allowCreate as any, overrides);
    return this.cleanContextualizedArgs(result);
  }

  private cleanContextualizedArgs<
    ARGS extends any[],
    METHOD extends MethodOrOperation,
  >(
    args:
      | ContextualizedArgs<
          FabricContractContext,
          ARGS,
          METHOD extends string ? true : false
        >
      | Promise<
          ContextualizedArgs<
            FabricContractContext,
            ARGS,
            METHOD extends string ? true : false
          >
        >
  ):
    | ContextualizedArgs<
        FabricContractContext,
        ARGS,
        METHOD extends string ? true : false
      >
    | Promise<
        ContextualizedArgs<
          FabricContractContext,
          ARGS,
          METHOD extends string ? true : false
        >
      > {
    if (args instanceof Promise) {
      return args.then((ctxArgs) => this.applyCleanContext(ctxArgs));
    }
    return this.applyCleanContext(args);
  }

  private applyCleanContext<
    ARGS extends any[],
    METHOD extends MethodOrOperation,
  >(
    ctxArgs: ContextualizedArgs<
      FabricContractContext,
      ARGS,
      METHOD extends string ? true : false
    >
  ) {
    this.cleanContext(ctxArgs.ctx);
    return ctxArgs;
  }

  private cleanContext(ctx: FabricContractContext): FabricContractContext {
    ctx.put("segregated", undefined);
    ctx.put("allowGatewayOverride", undefined);
    return ctx;
  }
}

async function countStoredEntries<M extends Model>(
  ctx: FabricContractContext,
  clazz: Constructor<M>
): Promise<number | undefined> {
  const stub = ctx?.stub as
    | {
        state?: Record<string, Buffer>;
        privateState?: Record<string, Record<string, Buffer>>;
        getStateByPartialCompositeKey?: (
          objectType: string,
          attributes: string[]
        ) => Promise<any>;
      }
    | undefined;
  if (!stub) return undefined;

  const table = Model.tableName(clazz);
  const prefix = `${table}_`;
  const seen = new Set<string>();

  if (typeof stub.getStateByPartialCompositeKey === "function") {
    const iterator = await stub.getStateByPartialCompositeKey(table, []);
    try {
      while (true) {
        const result = await iterator.next();
        if (result?.done) break;
        const key = result?.value?.key;
        if (key && key.startsWith(prefix)) {
          seen.add(key);
        }
      }
    } finally {
      if (iterator && typeof iterator.close === "function") {
        await iterator.close();
      }
    }
  }

  if (stub.state) {
    Object.keys(stub.state)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => seen.add(key));
  }

  const { privateCols, sharedCols } = Model.collectionsFor(clazz);
  const resolvers = [...privateCols, ...sharedCols];
  if (resolvers.length && stub.privateState) {
    const msp = extractMspId(ctx.identity);
    const collections = await Promise.all(
      resolvers.map((resolver) =>
        typeof resolver === "string" ? resolver : resolver(clazz, msp, ctx)
      )
    );
    for (const collection of collections) {
      const entries = stub.privateState[collection];
      if (!entries) continue;
      Object.keys(entries)
        .filter((key) => key.startsWith(prefix))
        .forEach((key) => seen.add(key));
    }
  }

  return seen.size ? seen.size : undefined;
}
