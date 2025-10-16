import { BulkCrudOperationKeys, OperationKeys } from "@decaf-ts/db-decorators";
import { EventIds, ObserverHandler } from "@decaf-ts/core";
import { generateFabricEventName } from "../shared/events";
import { Logger } from "@decaf-ts/logging";
import { Context } from "fabric-contract-api";

/**
 * @description Observer handler for Fabric chaincode events
 * @summary Emits events on the Fabric ledger when repository operations occur
 * @class FabricContractRepositoryObservableHandler
 * @extends {ObserverHandler}
 * @example
 * ```typescript
 * // In a Fabric chaincode contract
 * import { FabricContractRepositoryObservableHandler } from '@decaf-ts/for-fabric';
 *
 * // Create a handler with default supported events
 * const handler = new FabricContractRepositoryObservableHandler();
 *
 * // Emit an event
 * await handler.updateObservers(
 *   logger,
 *   'assets',
 *   OperationKeys.CREATE,
 *   'asset1',
 *   context
 * );
 * ```
 * @mermaid
 * sequenceDiagram
 *   participant Repository
 *   participant ObservableHandler
 *   participant Stub
 *   participant Ledger
 *
 *   Repository->>ObservableHandler: updateObservers(log, table, event, id, ctx)
 *   ObservableHandler->>ObservableHandler: Check if event is supported
 *   ObservableHandler->>ObservableHandler: generateFabricEventName(table, event, owner)
 *   ObservableHandler->>Stub: setEvent(eventName, payload)
 *   Stub->>Ledger: Record event
 */
export class FabricContractRepositoryObservableHandler extends ObserverHandler {
  /**
   * @description Creates a new FabricContractRepositoryObservableHandler instance
   * @summary Initializes the handler with a list of supported events
   * @param {Array<OperationKeys | BulkCrudOperationKeys | string>} [supportedEvents] - Events that will trigger Fabric events
   */
  constructor(
    private supportedEvents: (
      | OperationKeys
      | BulkCrudOperationKeys
      | string
    )[] = [
      OperationKeys.CREATE,
      OperationKeys.UPDATE,
      OperationKeys.DELETE,
      BulkCrudOperationKeys.CREATE_ALL,
      BulkCrudOperationKeys.UPDATE_ALL,
      BulkCrudOperationKeys.DELETE_ALL,
    ]
  ) {
    super();
  }

  /**
   * @description Updates observers by emitting Fabric events
   * @summary Emits events on the Fabric ledger for supported event types
   * @param {Logger} log - Logger instance for debugging
   * @param {string} table - The table/collection name
   * @param {OperationKeys | BulkCrudOperationKeys | string} event - The event type
   * @param {EventIds} id - The event identifier
   * @param {FabricContractContext} ctx - The Fabric contract context
   * @param {string} [owner] - Optional owner identifier for the event
   * @return {Promise<void>} Promise that resolves when the event is emitted
   */
  override async updateObservers(
    log: Logger,
    table: string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ctx: Context,
    owner?: string,
    payload?: object | string | undefined
  ): Promise<void> {
    const { stub } = ctx;
    if (this.supportedEvents.indexOf(event) !== -1) {
      log.debug(`Emitting ${event} event`);
      const eventName = generateFabricEventName(table, event, owner);
      stub.setEvent(eventName, Buffer.from(JSON.stringify({ id: id })));
    } else {
      stub.setEvent(event, Buffer.from(JSON.stringify(payload)));
    }
  }
}
