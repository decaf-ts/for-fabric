import { BulkCrudOperationKeys, OperationKeys } from "@decaf-ts/db-decorators";
import { EventIds, ObserverHandler } from "@decaf-ts/core";
import { generateFabricEventName } from "../shared/events";
import { FabricContractContext } from "./ContractContext";
import { Logger } from "@decaf-ts/logging";

export class FabricContractRepositoryObservableHandler extends ObserverHandler {
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

  override async updateObservers(
    log: Logger,
    table: string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ctx: FabricContractContext,
    owner?: string
  ): Promise<void> {
    const { stub } = ctx;
    if (this.supportedEvents.indexOf(event) !== -1) {
      log.debug(`Emitting ${event} event`);
      const eventName = generateFabricEventName(table, event, owner);
      stub.setEvent(eventName, Buffer.from(JSON.stringify({ id: id })));
    }
  }
}
