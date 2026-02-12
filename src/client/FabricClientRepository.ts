import {
  OrderDirection,
  PersistenceKeys,
  Repository,
  ContextOf,
  PreparedStatementKeys,
  SerializedPage,
  DirectionLimitOffset,
  Paginator,
  FlagsOf,
  ObserverHandler,
} from "@decaf-ts/core";
import type { MaybeContextualArg } from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import { type FabricClientAdapter } from "./FabricClientAdapter";
import { SegregatedModel } from "../shared/types";
import {
  OperationKeys,
  PrimaryKeyType,
  ValidationError,
  reduceErrorsToPrint,
  enforceDBDecorators,
} from "@decaf-ts/db-decorators";
import { CouchDBKeys } from "@decaf-ts/for-couchdb";

/**
 * @description Repository implementation for Fabric client operations
 * @summary Extends the generic Repository to prepare context and arguments for CRUD operations executed via a Fabric client Adapter, wiring RepositoryFlags and Fabric-specific overrides.
 * @template M extends Model - The model type handled by this repository
 * @param {Adapter<any, MangoQuery, FabricFlags, Context<FabricFlags>>} [adapter] - Optional adapter instance used to execute operations
 * @param {Constructor<M>} [clazz] - Optional model constructor used by the repository
 * @return {void}
 * @class FabricClientRepository
 * @example
 * import { Repository } from "@decaf-ts/core";
 * import { FabricClientRepository } from "@decaf-ts/for-fabric";
 *
 * class User extends Model { id!: string; name!: string; }
 * const repo = new FabricClientRepository<User>();
 * const created = await repo.create(new User({ id: "1", name: "Alice" }));
 * const loaded = await repo.read("1");
 *
 * @mermaid
 * sequenceDiagram
 *   participant App
 *   participant Repo as FabricClientRepository
 *   participant Adapter
 *   App->>Repo: create(model)
 *   Repo->>Repo: createPrefix(model, ...args)
 *   Repo->>Adapter: create(table, id, model, flags)
 *   Adapter-->>Repo: result
 *   Repo-->>App: model
 */
export class FabricClientRepository<
  M extends Model,
  A extends FabricClientAdapter = FabricClientAdapter,
> extends Repository<M, A> {
  protected override _overrides = Object.assign({}, super["_overrides"], {
    ignoreValidation: true,
    ignoreHandlers: true,
    allowRawStatements: false,
    forcePrepareSimpleQueries: true,
    forcePrepareComplexQueries: true,
    allowGenerationOverride: false,
  });

  constructor(adapter?: A, clazz?: Constructor<M>) {
    super(adapter, clazz);
  }

  override override(flags: Partial<FlagsOf<ContextOf<A>>>): this {
    return super
      .override(Object.assign({}, flags, this._overrides))
      .for(flags as any);
  }

  protected override ObserverHandler(): ObserverHandler {
    return super.ObserverHandler();
  }

  override async paginateBy(
    key: keyof M,
    order: OrderDirection,
    ref: Omit<DirectionLimitOffset, "direction"> = {
      offset: 1,
      limit: 10,
    },
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<SerializedPage<M>> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.PAGE_BY, true)
    ).for(this.paginateBy);
    log.verbose(
      `paginating ${Model.tableName(this.class)} with page size ${ref.limit}`
    );
    return this.statement(
      this.paginateBy.name,
      key,
      order,
      { limit: ref.limit, offset: ref.offset, bookmark: ref.bookmark },
      ...ctxArgs
    );
  }

  override async listBy(
    key: keyof M,
    order: OrderDirection,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M[]> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.LIST_BY, true)
    ).for(this.listBy);
    log.verbose(
      `listing ${Model.tableName(this.class)} by ${key as string} ${order}`
    );
    return (await this.statement(
      this.listBy.name,
      key,
      order,
      ...ctxArgs
    )) as any;
  }

  override async findBy(
    key: keyof M,
    value: any,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M[]> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.FIND_BY, true)
    ).for(this.findBy);
    log.verbose(
      `finding all ${Model.tableName(this.class)} with ${key as string} ${value}`
    );
    return (await this.statement(
      this.findBy.name,
      key,
      value,
      ...ctxArgs
    )) as any;
  }

  override async findOneBy(
    key: keyof M,
    value: any,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.FIND_ONE_BY, true)
    ).for(this.findOneBy);
    log.verbose(
      `finding One ${Model.tableName(this.class)} with ${key as string} ${value}`
    );
    return (await this.statement(
      this.findOneBy.name,
      key,
      value,
      ...ctxArgs
    )) as any;
  }

  override async find(
    value: string,
    order: OrderDirection = OrderDirection.ASC,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M[]> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.FIND, true)
    ).for(this.find);
    log.verbose(
      `finding ${Model.tableName(this.class)} by default query attributes`
    );
    return (await this.statement(
      this.find.name,
      value,
      order,
      ...ctxArgs
    )) as any;
  }

  override async page(
    value: string,
    direction: OrderDirection = OrderDirection.ASC,
    ref: Omit<DirectionLimitOffset, "direction"> = {
      offset: 1,
      limit: 10,
    },
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<SerializedPage<M>> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.PAGE, true)
    ).for(this.page);
    log.verbose(
      `paging ${Model.tableName(this.class)} by default query attributes`
    );
    return (await this.statement(
      this.page.name,
      value,
      direction,
      ref,
      ...ctxArgs
    )) as any;
  }

  override async statement(
    name: string,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<any> {
    const { log, ctx, ctxArgs } = (
      await this.logCtx(args, PersistenceKeys.STATEMENT, true)
    ).for(this.statement);
    log.verbose(`Executing prepared statement ${name}`);
    const callArgs = ctxArgs.slice(0, -1);
    const result = JSON.parse(
      this.adapter.decode(
        await this.adapter.evaluateTransaction(
          ctx,
          PersistenceKeys.STATEMENT,
          [name, JSON.stringify(callArgs)],
          undefined,
          undefined,
          this.class.name
        )
      )
    );

    if (Array.isArray(result)) {
      return result.map((r: any) =>
        (r as any)[CouchDBKeys.TABLE] &&
        (r as any)[CouchDBKeys.TABLE] === Model.tableName(this.class)
          ? new this.class(r)
          : r
      );
    }
    return (result as any)[CouchDBKeys.TABLE] &&
      (result as any)[CouchDBKeys.TABLE] === Model.tableName(this.class)
      ? new this.class(result)
      : Paginator.isSerializedPage(result)
        ? Object.assign(result, {
            data: result.data.map((d: any) => new this.class(d)),
          })
        : result;
  }

  override async countOf(
    key?: keyof M,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<number> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.COUNT_OF, true)
    ).for(this.countOf);
    log.verbose(
      `counting ${Model.tableName(this.class)}${key ? ` by ${key as string}` : ""}`
    );
    const stmtArgs = key ? [key, ...ctxArgs] : ctxArgs;
    return this.statement(PreparedStatementKeys.COUNT_OF, ...stmtArgs);
  }

  override async maxOf<K extends keyof M>(
    key: K,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M[K]> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.MAX_OF, true)
    ).for(this.maxOf);
    log.verbose(
      `finding max of ${key as string} in ${Model.tableName(this.class)}`
    );
    return this.statement(PreparedStatementKeys.MAX_OF, key, ...ctxArgs);
  }

  override async minOf<K extends keyof M>(
    key: K,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M[K]> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.MIN_OF, true)
    ).for(this.minOf);
    log.verbose(
      `finding min of ${key as string} in ${Model.tableName(this.class)}`
    );
    return this.statement(PreparedStatementKeys.MIN_OF, key, ...ctxArgs);
  }

  override async avgOf<K extends keyof M>(
    key: K,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<number> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.AVG_OF, true)
    ).for(this.avgOf);
    log.verbose(
      `calculating avg of ${key as string} in ${Model.tableName(this.class)}`
    );
    return this.statement(PreparedStatementKeys.AVG_OF, key, ...ctxArgs);
  }

  override async sumOf<K extends keyof M>(
    key: K,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<number> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.SUM_OF, true)
    ).for(this.sumOf);
    log.verbose(
      `calculating sum of ${key as string} in ${Model.tableName(this.class)}`
    );
    return this.statement(PreparedStatementKeys.SUM_OF, key, ...ctxArgs);
  }

  override async distinctOf<K extends keyof M>(
    key: K,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M[K][]> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.DISTINCT_OF, true)
    ).for(this.distinctOf);
    log.verbose(
      `finding distinct values of ${key as string} in ${Model.tableName(this.class)}`
    );
    return this.statement(PreparedStatementKeys.DISTINCT_OF, key, ...ctxArgs);
  }

  override async groupOf<K extends keyof M>(
    key: K,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<Record<string, M[]>> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.GROUP_OF, true)
    ).for(this.groupOf);
    log.verbose(`grouping ${Model.tableName(this.class)} by ${key as string}`);
    return this.statement(PreparedStatementKeys.GROUP_OF, key, ...ctxArgs);
  }

  async healthcheck(...args: MaybeContextualArg<ContextOf<A>>) {
    const { log, ctxArgs } = this.logCtx(args, this.healthcheck);

    const result = await this.adapter.healthcheck(this.class, ...ctxArgs);

    return result;
  }

  override async create(
    model: M,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M> {
    const { ctx, log, ctxArgs } = this.logCtx(args, this.create);
    log.debug(
      `Creating new ${this.class.name} in table ${Model.tableName(this.class)}`
    );
    this.ensureLegacyMirrorFlag(ctx, model);
    const prepared = this.adapter.prepare(model, ctx);
    const { record, id, transient } = prepared;
    const result = await this.adapter.create(
      this.class,
      id,
      record,
      transient,
      ...ctxArgs
    );
    if (
      this.shouldRefreshAfterWrite(prepared, ctx) &&
      id !== undefined &&
      id !== null
    ) {
      const refreshed = await this.adapter.read(this.class, id, ctx);
      return this.adapter.revert<M>(
        refreshed,
        this.class,
        id,
        ctx.get("rebuildWithTransient") ? prepared.transient : undefined,
        ctx
      );
    }
    return this.adapter.revert<M>(result, this.class, id, transient, ctx);
  }

  override async update(
    model: M,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M> {
    const { ctxArgs, log, ctx } = this.logCtx(args, this.update);
    this.ensureLegacyMirrorFlag(ctx, model);
    const prepared = this.adapter.prepare(model, ctx);
    const { id, transient } = prepared;
    let record = prepared.record;
    log.debug(
      `updating ${this.class.name} in table ${Model.tableName(this.class)} with id ${id}`
    );
    record = await this.adapter.update(
      this.class,
      id,
      record,
      transient,
      ...ctxArgs
    );
    if (
      this.shouldRefreshAfterWrite(prepared, ctx) &&
      id !== undefined &&
      id !== null
    ) {
      const refreshed = await this.adapter.read(this.class, id, ctx);
      return this.adapter.revert<M>(
        refreshed,
        this.class,
        id,
        ctx.get("rebuildWithTransient") ? prepared.transient : undefined,
        ctx
      );
    }
    return this.adapter.revert<M>(record, this.class, id, transient, ctx);
  }

  protected override async createAllPrefix(
    models: M[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[M[], ...any[], ContextOf<A>]> {
    const { ctx, ctxArgs } = (
      await this.logCtx(args, OperationKeys.CREATE, true)
    ).for(this.createAllPrefix);
    const ignoreHandlers = ctx.get("ignoreHandlers");
    const ignoreValidate = ctx.get("ignoreValidation");
    if (!models.length) return [models, ...ctxArgs] as any;

    models = await Promise.all(
      models.map(async (m) => {
        m = new this.class(m);
        if (!ignoreHandlers)
          await enforceDBDecorators<M, Repository<M, A>, any>(
            this,
            ctx,
            m,
            OperationKeys.CREATE,
            OperationKeys.ON
          );
        return m;
      })
    );

    if (!ignoreValidate) {
      const ignoredProps = ctx.get("ignoredValidationProperties") || [];

      const errors = await Promise.all(
        models.map((m) => Promise.resolve(m.hasErrors(...ignoredProps)))
      );

      const errorMessages = reduceErrorsToPrint(errors);

      if (errorMessages) throw new ValidationError(errorMessages);
    }
    return [models, ...ctxArgs] as any;
  }

  override async createAll(
    models: M[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M[]> {
    if (!models.length) return models;
    const { ctx, log, ctxArgs } = this.logCtx(args, this.createAll);
    log.debug(
      `Creating ${models.length} new ${this.class.name} in table ${Model.tableName(this.class)}`
    );

    models.forEach((model) => this.ensureLegacyMirrorFlag(ctx, model));
    const prepared = models.map((m) => this.adapter.prepare(m, ctx));
    const ids = prepared.map((p) => p.id);
    const payloads = prepared.map((p) => p.record);
    const transients = prepared.map((p) => p.transient);
    const created = await this.adapter.createAll(
      this.class,
      ids as PrimaryKeyType[],
      payloads,
      transients,
      ...ctxArgs
    );
    return Promise.all(
      created.map(async (r, i) => {
        const id = ids[i];
        if (
          this.shouldRefreshAfterWrite(prepared[i], ctx) &&
          id !== undefined &&
          id !== null
        ) {
          const refreshed = await this.adapter.read(this.class, id, ctx);
          return this.adapter.revert<M>(
            refreshed,
            this.class,
            id,
            ctx.get("rebuildWithTransient") ? prepared[i].transient : undefined,
            ctx
          );
        }

        return this.adapter.revert<M>(r, this.class, id, transients[i], ctx);
      })
    );
  }

  override async updateAll(
    models: M[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M[]> {
    const { ctx, log, ctxArgs } = this.logCtx(args, this.updateAll);
    log.debug(
      `Updating ${models.length} new ${this.class.name} in table ${Model.tableName(this.class)}`
    );

    models.forEach((model) => this.ensureLegacyMirrorFlag(ctx, model));
    const prepared = models.map((m) => this.adapter.prepare(m, ctx));
    const ids = prepared.map((p) => p.id);
    const updated = await this.adapter.updateAll(
      this.class,
      ids as PrimaryKeyType[],
      prepared.map((r) => r.record),
      prepared.map((r) => r.transient),
      ...ctxArgs
    );
    return Promise.all(
      updated.map(async (u, i) => {
        const id = ids[i];
        if (
          this.shouldRefreshAfterWrite(prepared[i], ctx) &&
          id !== undefined &&
          id !== null
        ) {
          const refreshed = await this.adapter.read(this.class, id, ctx);
          return this.adapter.revert<M>(
            refreshed,
            this.class,
            id,
            ctx.get("rebuildWithTransient") ? prepared[i].transient : undefined,
            ctx
          );
        }
        return this.adapter.revert<M>(
          u,
          this.class,
          id,
          prepared[i].transient,
          ctx
        );
      })
    );
  }

  private shouldRefreshAfterWrite(
    prepared: SegregatedModel<M>,
    ctx: ContextOf<A>
  ): boolean {
    const hasPrivate =
      prepared.privates && Object.keys(prepared.privates).length > 0;
    const hasShared =
      prepared.shared && Object.keys(prepared.shared).length > 0;
    return (
      hasPrivate ||
      hasShared ||
      !!ctx.getOrUndefined("segregated") ||
      !!ctx.getOrUndefined("mirror")
    );
  }

  private ensureLegacyMirrorFlag(ctx: ContextOf<A>, model: M): void {
    if (Model.mirroredAt(model)) {
      ctx.accumulate({ legacy: true });
    }
  }
}
