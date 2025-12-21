import {
  OrderDirection,
  PersistenceKeys,
  Repository,
  Context,
  ContextOf,
  PreparedStatementKeys,
} from "@decaf-ts/core";
import type { MaybeContextualArg } from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import { type FabricClientAdapter } from "./FabricClientAdapter";
import { FabricClientFlags } from "./types";
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
  });

  constructor(adapter?: A, clazz?: Constructor<M>) {
    super(adapter, clazz);
  }

  override async paginateBy(
    key: keyof M,
    order: OrderDirection,
    size: number,
    ...args: MaybeContextualArg<ContextOf<A>>
  ) {
    const contextArgs = await Context.args(
      PreparedStatementKeys.PAGE_BY,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctxArgs } = this.logCtx(contextArgs.args, this.paginateBy);
    log.verbose(
      `paginating ${Model.tableName(this.class)} with page size ${size}`
    );
    return this.select()
      .orderBy([key, order])
      .paginate(size, ...ctxArgs);
  }

  override async listBy(
    key: keyof M,
    order: OrderDirection,
    ...args: MaybeContextualArg<ContextOf<A>>
  ) {
    const contextArgs = await Context.args(
      "list",
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctxArgs } = this.logCtx(contextArgs.args, this.listBy);
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
    const contextArgs = await Context.args(
      PreparedStatementKeys.FIND_BY,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctxArgs } = this.logCtx(contextArgs.args, this.findBy);
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
    const contextArgs = await Context.args(
      PreparedStatementKeys.FIND_ONE_BY,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctxArgs } = this.logCtx(contextArgs.args, this.findOneBy);
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

  override async statement(
    name: string,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<any> {
    const contextArgs = await Context.args(
      PersistenceKeys.STATEMENT,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctx } = this.logCtx(contextArgs.args, this.statement);
    log.verbose(`Executing prepared statement ${name}`);
    const result = JSON.parse(
      this.adapter.decode(
        await this.adapter.evaluateTransaction(
          ctx,
          PersistenceKeys.STATEMENT,
          [name, JSON.stringify(contextArgs.args)],
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
      : result;
  }

  override async create(
    model: M,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M> {
    const { ctx, log, ctxArgs } = this.logCtx(args, this.create);
    log.debug(
      `Creating new ${this.class.name} in table ${Model.tableName(this.class)}`
    );
    // eslint-disable-next-line prefer-const
    let { record, id, transient } = this.adapter.prepare(model, ctx);
    record = await this.adapter.create(
      this.class,
      id,
      record,
      transient,
      ...ctxArgs
    );
    return this.adapter.revert<M>(record, this.class, id, transient, ctx);
  }

  override async update(
    model: M,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M> {
    const { ctxArgs, log, ctx } = this.logCtx(args, this.update);
    // eslint-disable-next-line prefer-const
    let { record, id, transient } = this.adapter.prepare(model, ctx);
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
    return this.adapter.revert<M>(record, this.class, id, transient, ctx);
  }

  protected override async createAllPrefix(
    models: M[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[M[], ...any[], ContextOf<A>]> {
    const contextArgs = await Context.args<M, Context<FabricClientFlags>>(
      OperationKeys.CREATE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const ignoreHandlers = contextArgs.context.get("ignoreHandlers");
    const ignoreValidate = contextArgs.context.get("ignoreValidation");
    if (!models.length) return [models, ...contextArgs.args] as any;

    models = await Promise.all(
      models.map(async (m) => {
        m = new this.class(m);
        if (!ignoreHandlers)
          await enforceDBDecorators<M, Repository<M, A>, any>(
            this,
            contextArgs.context,
            m,
            OperationKeys.CREATE,
            OperationKeys.ON
          );
        return m;
      })
    );

    if (!ignoreValidate) {
      const ignoredProps =
        contextArgs.context.get("ignoredValidationProperties") || [];

      const errors = await Promise.all(
        models.map((m) => Promise.resolve(m.hasErrors(...ignoredProps)))
      );

      const errorMessages = reduceErrorsToPrint(errors);

      if (errorMessages) throw new ValidationError(errorMessages);
    }
    return [models, ...contextArgs.args] as any;
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

    const prepared = models.map((m) => this.adapter.prepare(m, ctx));
    const ids = prepared.map((p) => p.id);
    let records = prepared.map((p) => p.record);
    const transient = prepared.map((p) => p.transient);
    records = await this.adapter.createAll(
      this.class,
      ids as PrimaryKeyType[],
      records,
      transient,
      ...ctxArgs
    );
    return records.map((r, i) =>
      this.adapter.revert(
        r,
        this.class,
        ids[i],
        ctx.get("rebuildWithTransient") ? prepared[i].transient : undefined,
        ctx
      )
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

    const records = models.map((m) => this.adapter.prepare(m, ctx));
    const updated = await this.adapter.updateAll(
      this.class,
      records.map((r) => r.id),
      records.map((r) => r.record),
      records.map((r) => r.transient),
      ...ctxArgs
    );
    return updated.map((u, i) =>
      this.adapter.revert(
        u,
        this.class,
        records[i].id,
        ctx.get("rebuildWithTransient") ? records[i].transient : undefined,
        ctx
      )
    );
  }
}
