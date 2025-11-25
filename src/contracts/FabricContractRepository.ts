import {
  Repository,
  ObserverHandler,
  EventIds,
  MaybeContextualArg,
} from "@decaf-ts/core";
import { FabricContractContext } from "./ContractContext";
import { Model } from "@decaf-ts/decorator-validation";
import { CouchDBAdapter } from "@decaf-ts/for-couchdb";
import { FabricContractRepositoryObservableHandler } from "./FabricContractRepositoryObservableHandler";
import { BulkCrudOperationKeys, OperationKeys } from "@decaf-ts/db-decorators";
import { Context } from "fabric-contract-api";
import { ContractLogger } from "./logging";
import { Logging } from "@decaf-ts/logging";
import { Constructor } from "@decaf-ts/decoration";

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
  CouchDBAdapter<any, void, FabricContractContext>
> {
  constructor(
    adapter?: CouchDBAdapter<any, void, FabricContractContext>,
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
  public logFor(ctx: Context | FabricContractContext): ContractLogger {
    if ((ctx as FabricContractContext).logger)
      return (ctx as FabricContractContext).logger as ContractLogger;
    return Logging.for(
      this as any,
      {
        correlationId: ctx.stub.getTxID(),
      },
      ctx
    ) as ContractLogger;
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
    ...args: MaybeContextualArg<FabricContractContext>
  ): Promise<void> {
    if (!this.trackedEvents || this.trackedEvents.indexOf(event) !== -1)
      return await super.updateObservers(table, event, id, ...args);
  }
}
