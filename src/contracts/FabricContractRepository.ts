import {
  Repository,
  ObserverHandler,
  EventIds,
  ContextualArgs,
  MaybeContextualArg,
  QueryError,
  Context,
  PersistenceKeys,
  ContextOf,
} from "@decaf-ts/core";
import { FabricContractContext } from "./ContractContext";
import { Model } from "@decaf-ts/decorator-validation";
import { FabricContractRepositoryObservableHandler } from "./FabricContractRepositoryObservableHandler";
import {
  BaseError,
  BulkCrudOperationKeys,
  enforceDBDecorators,
  InternalError,
  OperationKeys,
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

  protected override async createAllPrefix(
    models: M[],
    ...args: MaybeContextualArg<FabricContractContext>
  ): Promise<[M[], ...any[], FabricContractContext]> {
    const contextArgs = await Context.args(
      OperationKeys.CREATE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const log = contextArgs.context.logger.for(this.createAllPrefix);
    const ignoreHandlers = contextArgs.context.get("ignoreHandlers");
    const ignoreValidate = contextArgs.context.get("ignoreValidation");
    if (!models.length) return [models, ...contextArgs.args];
    const opts = Model.sequenceFor(models[0]);
    log.info(`Sequence options: ${JSON.stringify(opts)}`);
    let ids: (string | number | bigint | undefined)[] = [];
    if (opts.type) {
      if (!opts.name) opts.name = Model.sequenceName(models[0], "pk");
      ids = await (
        await this.adapter.Sequence(opts)
      ).range(models.length, ...contextArgs.args);
      log.info(`Sequence ids: ${ids}`);
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

        log.info(`Creating model ${JSON.stringify(m)}`);
        if (!ignoreHandlers)
          await enforceDBDecorators<M, Repository<M, any>, any>(
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

  override async statement(
    name: string,
    ...args: MaybeContextualArg<FabricContractContext>
  ) {
    if (!Repository.statements(this, name as keyof typeof this))
      throw new QueryError(`Invalid prepared statement requested ${name}`);
    const contextArgs = await Context.args(
      PersistenceKeys.STATEMENT,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    if (contextArgs.context.logger) {
      contextArgs.context.logger.info(`Repo statement: ${name} + ${args}`);
    }
    const { log, ctxArgs } = this.logCtx(contextArgs.args, this.statement);
    log.verbose(`Executing prepared statement ${name} with args ${ctxArgs}`);
    try {
      return (this as any)[name](...ctxArgs);
    } catch (e: unknown) {
      if (e instanceof BaseError) throw e;
      throw new InternalError(
        `Failed to execute prepared statement ${name} with args ${ctxArgs}: ${e}`
      );
    }
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
