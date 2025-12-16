import {
  OrderDirection,
  Paginator,
  PersistenceKeys,
  Repository,
  Sequence,
  Context,
} from "@decaf-ts/core";
import type { ContextOf, FlagsOf, MaybeContextualArg } from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import type { FabricClientAdapter } from "./FabricClientAdapter";
import {
  OperationKeys,
  enforceDBDecorators,
  ValidationError,
  InternalError,
  reduceErrorsToPrint,
  PrimaryKeyType,
} from "@decaf-ts/db-decorators";

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
export class FabricClientRepository<M extends Model> extends Repository<
  M,
  FabricClientAdapter
> {
  override _overrides?: Partial<FlagsOf<FabricClientAdapter>> = {
    ignoreValidation: true,
    ignoreHandlers: true,
    a,
  };

  constructor(adapter?: FabricClientAdapter, clazz?: Constructor<M>) {
    super(adapter, clazz);
  }

  override async paginateBy(
    key: keyof M,
    order: OrderDirection,
    size: number,
    ...args: MaybeContextualArg<ContextOf<FabricClientAdapter>>
  ): Promise<Paginator<M, M[], any>> {
    const contextArgs = await Context.args<M, ContextOf<FabricClientAdapter>>(
      "paginateBy",
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctxArgs } = this.logCtx(contextArgs.args, this.paginateBy);
    log.verbose(
      `paginating ${Model.tableName(this.class)} with page size ${size}`
    );
    return (await this.statement(
      this.paginateBy.name,
      key,
      order,
      size,
      ...ctxArgs
    )) as any;
  }

  override async listBy(
    key: keyof M,
    order: OrderDirection,
    ...args: MaybeContextualArg<ContextOf<FabricClientAdapter>>
  ) {
    const contextArgs = await Context.args<M, ContextOf<FabricClientAdapter>>(
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

  override async findOneBy(
    key: keyof M,
    value: any,
    ...args: MaybeContextualArg<ContextOf<FabricClientAdapter>>
  ): Promise<M[]> {
    const contextArgs = await Context.args<M, ContextOf<FabricClientAdapter>>(
      "findOneBy",
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctxArgs } = this.logCtx(contextArgs.args, this.findOneBy);
    log.verbose(
      `finding ${Model.tableName(this.class)} with ${key as string} ${value}`
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
    ...args: MaybeContextualArg<ContextOf<FabricClientAdapter>>
  ): Promise<any> {
    const contextArgs = await Context.args<M, ContextOf<FabricClientAdapter>>(
      "statement",
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctxArgs } = this.logCtx(contextArgs.args, this.statement);
    log.verbose(`Executing prepared statement ${name}`);
    return this.adapter.evaluateTransaction(
      PersistenceKeys.STATEMENT,
      ...ctxArgs
    );
  }

  protected override async createPrefix(
    model: M,
    ...args: MaybeContextualArg<ContextOf<FabricClientAdapter>>
  ): Promise<[M, ...any[], ContextOf<FabricClientAdapter>]> {
    const contextArgs = await Context.args<M, ContextOf<FabricClientAdapter>>(
      OperationKeys.CREATE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const ignoreHandlers = contextArgs.context.get("ignoreHandlers");
    const ignoreValidate = contextArgs.context.get("ignoreValidation");
    model = new this.class(model);
    if (!ignoreHandlers)
      await enforceDBDecorators<M, Repository<M, FabricClientAdapter>, any>(
        this,
        contextArgs.context,
        model,
        OperationKeys.CREATE,
        OperationKeys.ON
      );

    if (!ignoreValidate) {
      const errors = await Promise.resolve(
        model.hasErrors(
          ...(contextArgs.context.get("ignoredValidationProperties") || [])
        )
      );
      if (errors) throw new ValidationError(errors.toString());
    }

    return [model, ...contextArgs.args];
  }

  protected override async createAllPrefix(
    models: M[],
    ...args: MaybeContextualArg<ContextOf<FabricClientAdapter>>
  ): Promise<[M[], ...any[], ContextOf<FabricClientAdapter>]> {
    const contextArgs = await Context.args<M, ContextOf<FabricClientAdapter>>(
      OperationKeys.CREATE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const ignoreHandlers = contextArgs.context.get("ignoreHandlers");
    const ignoreValidate = contextArgs.context.get("ignoreValidation");
    if (!models.length) return [models, ...contextArgs.args];
    const opts = Model.sequenceFor(models[0]);
    let ids: (string | number | bigint | undefined)[] = [];
    if (opts.type) {
      if (!opts.name) opts.name = Sequence.pk(models[0]);
      ids = await (
        await this.adapter.Sequence(opts)
      ).range(models.length, ...contextArgs.args);
    } else {
      ids = models.map((m, i) => {
        if (typeof m[this.pk] === "undefined")
          throw new InternalError(
            `Primary key is not defined for model in position ${i}`
          );
        return m[this.pk] as string;
      });
    }

    models = await Promise.all(
      models.map(async (m, i) => {
        m = new this.class(m);
        if (opts.type) {
          m[this.pk] = (
            opts.type !== "String"
              ? ids[i]
              : opts.generated
                ? ids[i]
                : `${m[this.pk]}`.toString()
          ) as M[keyof M];
        }

        if (!ignoreHandlers)
          await enforceDBDecorators<M, Repository<M, FabricClientAdapter>, any>(
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
    return [models, ...contextArgs.args];
  }

  protected override async readPrefix(
    key: PrimaryKeyType,
    ...args: MaybeContextualArg<ContextOf<FabricClientAdapter>>
  ): Promise<[PrimaryKeyType, ...any[], ContextOf<FabricClientAdapter>]> {
    const contextArgs = await Context.args<M, ContextOf<FabricClientAdapter>>(
      OperationKeys.READ,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const model: M = new this.class();
    model[this.pk] = key as M[keyof M];
    await enforceDBDecorators<M, Repository<M, FabricClientAdapter>, any>(
      this,
      contextArgs.context,
      model,
      OperationKeys.READ,
      OperationKeys.ON
    );
    return [key, ...contextArgs.args];
  }

  protected override async readAllPrefix(
    keys: PrimaryKeyType[],
    ...args: MaybeContextualArg<ContextOf<FabricClientAdapter>>
  ): Promise<[PrimaryKeyType[], ...any[], ContextOf<FabricClientAdapter>]> {
    const contextArgs = await Context.args<M, ContextOf<FabricClientAdapter>>(
      OperationKeys.READ,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );

    await Promise.all(
      keys.map(async (k) => {
        const m = new this.class();
        m[this.pk] = k as M[keyof M];
        return enforceDBDecorators<M, Repository<M, FabricClientAdapter>, any>(
          this,
          contextArgs.context,
          m,
          OperationKeys.READ,
          OperationKeys.ON
        );
      })
    );
    return [keys, ...contextArgs.args];
  }

  protected override async updatePrefix(
    model: M,
    ...args: MaybeContextualArg<ContextOf<FabricClientAdapter>>
  ): Promise<[M, ...args: any[], ContextOf<FabricClientAdapter>]> {
    const contextArgs = await Context.args(
      OperationKeys.UPDATE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const ignoreHandlers = contextArgs.context.get("ignoreHandlers");
    const ignoreValidate = contextArgs.context.get("ignoreValidation");
    const pk = model[this.pk] as string;
    if (!pk)
      throw new InternalError(
        `No value for the Id is defined under the property ${this.pk as string}`
      );
    const oldModel = await this.read(pk, ...contextArgs.args);
    model = Model.merge(oldModel, model, this.class);
    if (!ignoreHandlers)
      await enforceDBDecorators(
        this,
        contextArgs.context as any,
        model,
        OperationKeys.UPDATE,
        OperationKeys.ON,
        oldModel
      );

    if (!ignoreValidate) {
      const errors = await Promise.resolve(
        model.hasErrors(
          oldModel,
          ...Model.relations(this.class),
          ...(contextArgs.context.get("ignoredValidationProperties") || [])
        )
      );
      if (errors) throw new ValidationError(errors.toString());
    }
    return [model, ...contextArgs.args];
  }

  override async update(
    model: M,
    ...args: MaybeContextualArg<ContextOf<FabricClientAdapter>>
  ): Promise<M> {
    const { ctxArgs, log, ctx } = this.logCtx(args, this.update);
    // eslint-disable-next-line prefer-const
    let { record, id, transient } = this.adapter.prepare(model, ctx);
    log.debug(
      `updating ${this.class.name} in table ${Model.tableName(this.class)} with id ${id}`
    );
    record = await this.adapter.update(this.class, id, record, ...ctxArgs);
    return this.adapter.revert<M>(record, this.class, id, transient, ctx);
  }
}
