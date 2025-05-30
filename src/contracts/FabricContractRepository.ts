import { Repository, ObserverHandler, EventIds } from "@decaf-ts/core";
import { FabricContractAdapter } from "./ContractAdapter";
import { FabricContractFlags } from "./types";
import { FabricContractContext } from "./ContractContext";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import { FabricContractRepositoryObservableHandler } from "./FabricContractRepositoryObservableHandler";
import { BulkCrudOperationKeys, OperationKeys } from "@decaf-ts/db-decorators";

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
   * @description Gets the observer handler for this repository
   * @summary Returns a FabricContractRepositoryObservableHandler instance
   * @return {ObserverHandler} The observer handler
   */
  override ObserverHandler(): ObserverHandler {
    return new FabricContractRepositoryObservableHandler();
  }

  /**
   * @description Creates a single model in the state database
   * @summary Prepares, creates, and reverts a model using the adapter
   * @param {M} model - The model to create
   * @param {...any[]} args - Additional arguments, including the chaincode context
   * @return {Promise<M>} Promise resolving to the created model
   */
  override async create(model: M, ...args: any[]): Promise<M> {
    // eslint-disable-next-line prefer-const
    let { record, id, transient } = this.adapter.prepare(model, this.pk);
    record = await this.adapter.create(
      this.tableName,
      id,
      record,
      transient || {},
      ...args
    );
    let c: FabricContractContext | undefined = undefined;
    if (args.length) c = args[args.length - 1] as FabricContractContext;
    return this.adapter.revert<M>(
      record,
      this.class,
      this.pk,
      id,
      c && c.get("rebuildWithTransient") ? transient : undefined
    );
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
    const prepared = models.map((m) => this.adapter.prepare(m, this.pk));
    const ids = prepared.map((p) => p.id);
    let records = prepared.map((p) => p.record);
    const transients = prepared.map((p) => p.transient).filter((e) => !!e);
    let c: FabricContractContext | undefined = undefined;
    if (args.length) c = args[args.length - 1] as FabricContractContext;
    records = await this.adapter.createAll(
      this.tableName,
      ids,
      records,
      transients,
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
   * @description Updates a single model in the state database
   * @summary Prepares, updates, and reverts a model using the adapter
   * @param {M} model - The model to update
   * @param {...any[]} args - Additional arguments, including the chaincode context
   * @return {Promise<M>} Promise resolving to the updated model
   */
  override async update(model: M, ...args: any[]): Promise<M> {
    // eslint-disable-next-line prefer-const
    let { record, id, transient } = this.adapter.prepare(model, this.pk);
    record = await this.adapter.update(
      this.tableName,
      id,
      record,
      transient || {},
      ...args
    );
    let c: FabricContractContext | undefined = undefined;
    if (args.length) c = args[args.length - 1] as FabricContractContext;
    return this.adapter.revert<M>(
      record,
      this.class,
      this.pk,
      id,
      c && c.get("rebuildWithTransient") ? transient : undefined
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
    const records = models.map((m) => this.adapter.prepare(m, this.pk));
    const transients = records.map((p) => p.transient).filter((e) => !!e);
    let c: FabricContractContext | undefined = undefined;
    if (args.length) c = args[args.length - 1] as FabricContractContext;

    const updated = await this.adapter.updateAll(
      this.tableName,
      records.map((r) => r.id),
      records.map((r) => r.record),
      transients,
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
}
