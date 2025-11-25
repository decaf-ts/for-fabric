import { BulkCrudOperationKeys, OperationKeys } from "@decaf-ts/db-decorators";
import {
  Adapter,
  ContextualArgs,
  EventIds,
  ObserverHandler,
} from "@decaf-ts/core";
import { generateFabricEventName } from "../shared/events";
import { FabricContractContext } from "./ContractContext";
import { Constructor } from "@decaf-ts/decoration";

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
   * @param {object | string | undefined} [owner] - Optional payload for the event
   *
   * @return {Promise<void>} Promise that resolves when the event is emitted
   */
  override async updateObservers(
    clazz: string | Constructor<any>,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ...args: ContextualArgs<FabricContractContext>
  ): Promise<void> {
    const { log, ctx } = Adapter.logCtx<FabricContractContext>(
      args,
      this.updateObservers
    );
    const { stub } = ctx;
    const [owner, payload] = args;
    const table = typeof clazz === "string" ? clazz : clazz.name;
    if (this.supportedEvents.indexOf(event) !== -1) {
      log.debug(`Emitting ${event} event`);
      const eventName = generateFabricEventName(table, event, owner);
      stub.setEvent(eventName, Buffer.from(JSON.stringify({ id: id })));
    } else {
      stub.setEvent(event, Buffer.from(JSON.stringify(payload)));
    }
  }
}
