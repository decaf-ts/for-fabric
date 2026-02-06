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
  ConflictError,
  enforceDBDecorators,
  InternalError,
  NotFoundError,
  OperationKeys,
  PrimaryKeyType,
  reduceErrorsToPrint,
  ValidationError,
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
  });

  constructor(
    adapter?: FabricContractAdapter,
    clazz?: Constructor<M>,
    protected trackedEvents?: (OperationKeys | BulkCrudOperationKeys | string)[]
  ) {
    super(adapter, clazz);
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

  protected override async createPrefix(
    model: M,
    ...args: MaybeContextualArg<FabricContractContext>
  ): Promise<[M, ...any[], FabricContractContext]> {
    const { ctx, ctxArgs, log } = (
      await this.logCtx(args, OperationKeys.CREATE, true)
    ).for(this.createPrefix);

    const ignoreHandlers = ctx.get("ignoreHandlers");
    const ignoreValidate = ctx.get("ignoreValidation");
    log.silly(
      `handlerSetting: ${ignoreHandlers}, validationSetting: ${ignoreValidate}`
    );
    model = new this.class(model);

    if (!ignoreValidate) {
      try {
        const id = model[this.pk];
        const existingElement = await this.read(id as PrimaryKeyType);
        if (existingElement)
          throw new ConflictError(`Record with id ${id} already exists.`);
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
      }
    }
    if (!ignoreHandlers)
      await enforceDBDecorators(
        this,
        ctx,
        model,
        OperationKeys.CREATE,
        OperationKeys.ON
      );

    if (!ignoreValidate) {
      const propsToIgnore = ctx.get("ignoredValidationProperties") || [];
      log.silly(`ignored validation properties: ${propsToIgnore}`);
      const errors = await Promise.resolve(model.hasErrors(...propsToIgnore));
      if (errors) throw new ValidationError(errors.toString());
    }

    return [model, ...ctxArgs];
  }

  protected override async createAllPrefix(
    models: M[],
    ...args: MaybeContextualArg<FabricContractContext>
  ): Promise<[M[], ...any[], FabricContractContext]> {
    const { ctx, ctxArgs, log } = (
      await this.logCtx(args, BulkCrudOperationKeys.CREATE_ALL, true)
    ).for(this.createAllPrefix);

    const ignoreHandlers = ctx.get("ignoreHandlers");
    const ignoreValidate = ctx.get("ignoreValidation");
    log.silly(
      `handlerSetting: ${ignoreHandlers}, validationSetting: ${ignoreValidate}`
    );
    if (!models.length) return [models, ...ctxArgs];

    if (!ignoreValidate) {
      try {
        const ids = models.map((model) => model[this.pk]);
        const existingElements = await this.readAll(ids as PrimaryKeyType[]);
        if (existingElements?.length)
          throw new ConflictError(
            `Records with id ${ids.join()} already exist.`
          );
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
      }
    }

    const opts = Model.sequenceFor(models[0]);
    let ids: (string | number | bigint | undefined)[] = [];
    if (Model.generatedBySequence(this.class)) {
      if (!opts.name) opts.name = Model.sequenceName(models[0], "pk");
      ids = await (
        await this.adapter.Sequence(opts)
      ).range(models.length, ...ctxArgs);
    } else if (!Model.generated(this.class, this.pk)) {
      ids = models.map((m, i) => {
        if (typeof m[this.pk] === "undefined")
          throw new InternalError(
            `Primary key is not defined for model in position ${i}`
          );
        return m[this.pk] as string;
      });
    } else {
      // do nothing. The pk is tagged as generated, so it'll be handled by some other decorator
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
          await enforceDBDecorators(
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
      const propsToIgnore = ctx.get("ignoredValidationProperties") || [];
      log.silly(`ignored validation properties: ${propsToIgnore}`);
      const errors = await Promise.all(
        models.map((m) => Promise.resolve(m.hasErrors(...propsToIgnore)))
      );

      const errorMessages = reduceErrorsToPrint(errors);

      if (errorMessages) throw new ValidationError(errorMessages);
    }
    return [models, ...ctxArgs];
  }
}
