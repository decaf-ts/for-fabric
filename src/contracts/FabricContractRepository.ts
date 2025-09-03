import {
  Repository,
  ObserverHandler,
  EventIds,
  WhereOption,
} from "@decaf-ts/core";
import { FabricContractAdapter } from "./ContractAdapter";
import { FabricContractFlags } from "./types";
import { FabricContractContext } from "./ContractContext";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import {
  Context as Ctx,
  enforceDBDecorators,
  InternalError,
  ValidationError,
} from "@decaf-ts/db-decorators";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import { FabricContractRepositoryObservableHandler } from "./FabricContractRepositoryObservableHandler";
import { BulkCrudOperationKeys, OperationKeys } from "@decaf-ts/db-decorators";
import { Context } from "fabric-contract-api";
import { FabricContractDBSequence } from "./FabricContractSequence";
import { ContractLogger } from "./logging";
import { Logging } from "@decaf-ts/logging";

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
  MangoQuery,
  FabricContractAdapter,
  FabricContractFlags,
  FabricContractContext
> {
  constructor(
    adapter?: FabricContractAdapter,
    clazz?: Constructor<M>,
    protected trackedEvents?: (OperationKeys | BulkCrudOperationKeys | string)[]
  ) {
    super(adapter, clazz);
  }

  /**
   * @description Creates a logger for a specific chaincode context
   * @summary Returns a ContractLogger instance configured for the current context
   * @param {Ctx} ctx - The Fabric chaincode context
   * @return {ContractLogger} The logger instance
   */
  public logFor(ctx: Context): ContractLogger {
    return Logging.for(FabricContractRepository, {}, ctx) as ContractLogger;
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
   * @description Creates multiple models in the state database
   * @summary Prepares, creates, and reverts multiple models using the adapter
   * @param {M[]} models - The models to create
   * @param {...any[]} args - Additional arguments, including the chaincode context
   * @return {Promise<M[]>} Promise resolving to the created models
   */
  override async createAll(models: M[], ...args: any[]): Promise<M[]> {
    if (!models.length) return models;
    const prepared = models.map((m) =>
      this.adapter.prepare(m, this.pk, this.tableName, ...args)
    );
    const ids = prepared.map((p) => p.id);
    let records = prepared.map((p) => p.record);
    const transients = prepared.map((p) => p.transient).filter((e) => !!e);
    let c: FabricContractContext | undefined = undefined;
    if (args.length) c = args[args.length - 1] as FabricContractContext;
    records = await this.adapter.createAll(
      this.tableName,
      ids,
      records,
      ...args
    );
    return records.map((r, i) =>
      this.adapter.revert(
        r,
        this.class,
        this.pk,
        ids[i] as string | number,
        c && c.get("rebuildWithTransient") ? transients : undefined
      )
    );
  }

  /**
   * @description Updates multiple models in the state database
   * @summary Prepares, updates, and reverts multiple models using the adapter
   * @param {M[]} models - The models to update
   * @param {...any[]} args - Additional arguments, including the chaincode context
   * @return {Promise<M[]>} Promise resolving to the updated models
   */
  override async updateAll(models: M[], ...args: any[]): Promise<M[]> {
    if (!models.length) return models;
    const records = models.map((m) =>
      this.adapter.prepare(m, this.pk, this.tableName, ...args)
    );
    const transients = records.map((p) => p.transient).filter((e) => !!e);
    let c: FabricContractContext | undefined = undefined;
    if (args.length) c = args[args.length - 1] as FabricContractContext;

    const updated = await this.adapter.updateAll(
      this.tableName,
      records.map((r) => r.id),
      records.map((r) => r.record),
      ...args
    );
    return updated.map((u, i) =>
      this.adapter.revert(
        u,
        this.class,
        this.pk,
        records[i].id,
        c && c.get("rebuildWithTransient") ? transients : undefined
      )
    );
  }

  /**
   * @description Executes a raw query against the state database
   * @summary Delegates to the adapter's raw method
   * @param {MangoQuery} rawInput - The Mango Query to execute
   * @param {boolean} docsOnly - Whether to return only documents
   * @param {...any[]} args - Additional arguments, including the chaincode context
   * @return {Promise<any>} Promise resolving to the query results
   */
  async raw(rawInput: MangoQuery, docsOnly: boolean, ...args: any[]) {
    return this.adapter.raw(rawInput, docsOnly, ...args);
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
    table: string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ctx: FabricContractContext,
    ...args: any[]
  ): Promise<void> {
    if (!this.trackedEvents || this.trackedEvents.indexOf(event) !== -1)
      return await super.updateObservers(table, event, id, ctx, ...args);
  }

  override select<S extends readonly (keyof M)[]>(): WhereOption<M, M[]>;
  override select<S extends readonly (keyof M)[]>(
    selector: readonly [...S]
  ): WhereOption<M, Pick<M, S[number]>[]>;
  override select<S extends readonly (keyof M)[]>(
    selector: undefined,
    ctx: FabricContractContext
  ): WhereOption<M, M[]>;
  override select<S extends readonly (keyof M)[]>(
    selector?: readonly [...S],
    ctx?: FabricContractContext
  ): WhereOption<M, M[]> | WhereOption<M, Pick<M, S[number]>[]> {
    if (!selector) {
      return this.adapter.Statement<M>(ctx).select().from(this.class);
    }
    return this.adapter.Statement<M>(ctx).select(selector).from(this.class);
  }

  /**
   * @description Creates a single model in the state database
   * @summary Prepares, creates, and reverts a model using the adapter
   * @param {M} model - The model to create
   * @param {...any[]} args - Additional arguments, including the chaincode context
   * @return {Promise<M>} Promise resolving to the created model
   */
  override async create(model: M, ...args: any[]): Promise<M> {
    const ctx = args[args.length - 1] as Context;
    const log = this.logFor(ctx).for(this.create);
    log.info(`Preparing model: ${JSON.stringify(model)}`);
    // eslint-disable-next-line prefer-const
    let { record, id, transient } = this.adapter.prepare(
      model,
      this.pk,
      this.tableName,
      ...args
    );
    log.info(`Creating model: ${JSON.stringify(model)}`);
    record = await this.adapter.create(this.tableName, id, record, ...args);
    let c: FabricContractContext | undefined = undefined;
    if (args.length) c = args[args.length - 1] as FabricContractContext;
    log.info(`Reverting model: ${JSON.stringify(model)}`);
    return this.adapter.revert<M>(
      record,
      this.class,
      this.pk,
      id,
      c && c.get("rebuildWithTransient") ? transient : undefined
    );
  }

  /**
   * @description Updates a single model in the state database
   * @summary Prepares, updates, and reverts a model using the adapter
   * @param {M} model - The model to update
   * @param {...any[]} args - Additional arguments, including the chaincode context
   * @return {Promise<M>} Promise resolving to the updated model
   */
  override async update(model: M, ...args: any[]): Promise<M> {
    const ctx = args[args.length - 1] as Context;
    const log = this.logFor(ctx).for(this.update);
    log.info(`Preparing model: ${JSON.stringify(model)}`);
    // eslint-disable-next-line prefer-const
    let { record, id, transient } = this.adapter.prepare(
      model,
      this.pk,
      this.tableName,
      ...args
    );
    log.info(`Updating model: ${JSON.stringify(model)}`);
    record = await this.adapter.update(this.tableName, id, record, ...args);
    let c: FabricContractContext | undefined = undefined;
    if (args.length) c = args[args.length - 1] as FabricContractContext;
    log.info(`Reverting model: ${JSON.stringify(model)}`);
    return this.adapter.revert<M>(
      record,
      this.class,
      this.pk,
      id,
      c && c.get("rebuildWithTransient") ? transient : undefined
    );
  }

  /**
   * @description Prepares multiple models for creation.
   * @summary Validates multiple models and prepares them for creation in the database.
   * @param {M[]} models - The models to create.
   * @param {...any[]} args - Additional arguments.
   * @return The prepared models and context arguments.
   * @throws {ValidationError} If any model fails validation.
   */
  protected override async createAllPrefix(models: M[], ...args: any[]) {
    const ctx = args[args.length - 1] as Context;

    const contextArgs = await Ctx.args(
      OperationKeys.CREATE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    if (!models.length) return [models, ...contextArgs.args];
    const opts = Repository.getSequenceOptions(models[0]);
    let ids: (string | number | bigint | undefined)[] = [];
    if (opts.type) {
      if (!opts.name) opts.name = FabricContractDBSequence.pk(models[0]);
      ids = await (
        (await this.adapter.Sequence(opts)) as FabricContractDBSequence
      ).range(models.length, ctx as unknown as FabricContractContext);
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
        if (opts.type) m[this.pk] = ids[i] as M[keyof M];
        await enforceDBDecorators(
          this,
          contextArgs.context,
          m,
          OperationKeys.CREATE,
          OperationKeys.ON
        );
        return m;
      })
    );

    const ignoredProps =
      contextArgs.context.get("ignoredValidationProperties") || [];

    const errors = await Promise.all(
      models.map((m) => Promise.resolve(m.hasErrors(...ignoredProps)))
    );

    const errorMessages = errors.reduce((accum: string | undefined, e, i) => {
      if (e)
        accum =
          typeof accum === "string"
            ? accum + `\n - ${i}: ${e.toString()}`
            : ` - ${i}: ${e.toString()}`;
      return accum;
    }, undefined);

    if (errorMessages) throw new ValidationError(errorMessages);
    return [models, ...contextArgs.args];
  }
}
