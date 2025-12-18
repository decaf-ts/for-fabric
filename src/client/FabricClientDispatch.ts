import {
  Adapter,
  ContextualArgs,
  Dispatch,
  EventIds,
  UnsupportedError,
  Context,
} from "@decaf-ts/core";
import { PeerConfig } from "../shared/types";
import { Client } from "@grpc/grpc-js";
import { FabricClientAdapter } from "./FabricClientAdapter";
import {
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import {
  ChaincodeEvent,
  CloseableAsyncIterable,
} from "@hyperledger/fabric-gateway";
import { parseEventName } from "../shared/events";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import { FabricClientFlags } from "./types";

/**
 * @description Event dispatcher for Hyperledger Fabric chaincode events
 * @summary Listens for and processes events emitted by Fabric chaincode, dispatching them to registered observers
 * @template PeerConfig - Configuration type for connecting to a Fabric peer
 * @param client - gRPC client for connecting to the Fabric network
 * @class FabricClientDispatch
 * @example
 * ```typescript
 * // Create a new FabricDispatch instance
 * const client = await FabricAdapter.getClient(peerConfig);
 * const dispatch = new FabricDispatch(client);
 *
 * // Configure the dispatch with peer configuration
 * dispatch.configure(peerConfig);
 *
 * // Register an observer for a specific table and event
 * dispatch.observe('users', 'create', (id) => {
 *   console.log(`User created: ${id}`);
 * });
 *
 * // Start listening for events
 * await dispatch.start();
 * ```
 * @mermaid
 * sequenceDiagram
 *   participant Client
 *   participant FabricDispatch
 *   participant Gateway
 *   participant Network
 *   participant Chaincode
 *
 *   Client->>FabricDispatch: new FabricDispatch(client)
 *   Client->>FabricDispatch: configure(peerConfig)
 *   Client->>FabricDispatch: observe(table, event, callback)
 *   Client->>FabricDispatch: start()
 *   FabricDispatch->>FabricDispatch: initialize()
 *   FabricDispatch->>Gateway: getGateway(config, client)
 *   Gateway->>Network: getNetwork(channel)
 *   Network->>Network: getChaincodeEvents(chaincodeName)
 *   FabricDispatch->>FabricDispatch: handleEvents()
 *   loop For each event
 *     Chaincode-->>FabricDispatch: ChaincodeEvent
 *     FabricDispatch->>FabricDispatch: parseEventName(eventName)
 *     FabricDispatch->>FabricDispatch: parsePayload(payload)
 *     FabricDispatch->>FabricDispatch: updateObservers(table, event, id)
 *     FabricDispatch-->>Client: callback(id)
 *   end
 */
export class FabricClientDispatch extends Dispatch<FabricClientAdapter> {
  /**
   * @description Event listening stack for chaincode events
   */
  private listeningStack?: CloseableAsyncIterable<ChaincodeEvent>;

  /**
   * @description Text decoder for converting event payloads from bytes to strings
   */
  private decoder = new TextDecoder("utf8");

  /**
   * @description Creates a new FabricDispatch instance
   * @summary Initializes a dispatcher for Fabric chaincode events
   * @param {Client} client - gRPC client for connecting to the Fabric network
   */
  constructor(protected client: Client) {
    super();
  }

  /**
   * @description Closes the event listening connection
   * @summary Stops listening for chaincode events and releases resources
   * @return {Promise<void>} Promise that resolves when the connection is closed
   */
  override async close() {
    if (this.listeningStack) this.listeningStack.close();
  }

  /**
   * @description Parses event payload from binary format
   * @summary Converts a Uint8Array containing JSON to an object with an id property
   * @param {Uint8Array} jsonBytes - The binary payload from the chaincode event
   * @return {{ id: string }} The parsed payload containing the record ID
   */
  private parsePayload(jsonBytes: Uint8Array): { id: string } {
    const json = this.decoder.decode(jsonBytes);
    return JSON.parse(json);
  }

  /**
   * @description Starts observing an adapter
   * @summary Connects this dispatch to an adapter to monitor its operations
   * @param {Adapter<any, any, any, any>} observer - The adapter to observe
   * @return {void}
   */
  override observe(observer: Adapter<any, any, any, any>): void {
    if (!(observer instanceof FabricClientAdapter))
      throw new UnsupportedError(
        "Only FabricClientAdapter can be observed by dispatch"
      );
    super.observe(observer as FabricClientAdapter);
  }

  /**
   * @description Updates observers about a database event
   * @summary Notifies observers about a change in the database
   * @param {string} table - The name of the table where the change occurred
   * @param {OperationKeys|BulkCrudOperationKeys|string} event - The type of operation that occurred
   * @param {any} payload - The event payload
   * @return {Promise<void>} A promise that resolves when all observers have been notified
   */
  override async updateObservers(
    model: Constructor<any> | string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ...args: ContextualArgs<Context<FabricClientFlags>>
  ): Promise<void> {
    const { log, ctxArgs } = this.logCtx(args, this.updateObservers);
    if (!this.adapter) {
      log.verbose(
        `No adapter observed for dispatch; skipping observer update for ${typeof model === "string" ? model : Model.tableName(model)}:${event}`
      );
      return;
    }
    try {
      await this.adapter.refresh(model, event, id, ...ctxArgs);
    } catch (e: unknown) {
      throw new InternalError(`Failed to refresh dispatch: ${e}`);
    }
  }

  /**
   * @description Processes incoming chaincode events
   * @summary Listens for events from the chaincode and dispatches them to registered observers
   * @return {Promise<void>} Promise that resolves when event handling stops
   * @mermaid
   * sequenceDiagram
   *   participant FabricDispatch
   *   participant EventStack
   *   participant EventParser
   *   participant Observers
   *
   *   FabricDispatch->>FabricDispatch: handleEvents()
   *   FabricDispatch->>EventStack: for await (const evt of listeningStack)
   *   EventStack-->>FabricDispatch: ChaincodeEvent
   *   FabricDispatch->>EventParser: parseEventName(evt.eventName)
   *   EventParser-->>FabricDispatch: { table, event, owner }
   *   FabricDispatch->>FabricDispatch: Check if event is for this MSP
   *   FabricDispatch->>FabricDispatch: parsePayload(evt.payload)
   *   FabricDispatch->>Observers: updateObservers(table, event, payload.id)
   *   Observers-->>FabricDispatch: Callbacks executed
   */
  protected async handleEvents(
    ctxArg?: Context<FabricClientFlags>
  ): Promise<void> {
    if (!this.listeningStack)
      throw new InternalError(
        `Event stack not initialized. Ensure that "startListening" is called before attempting this operation.`
      );

    if (!this.adapter || !this.adapter.config)
      throw new InternalError(`No adapter found. should be impossible`);

    const ctx =
      ctxArg ||
      (await this.adapter.context(
        OperationKeys.READ,
        {
          correlationId: this.adapter.config.chaincodeName,
        },
        (this.models && this.models[0]) || (Model as unknown as Constructor)
      ));
    const log = this.log.for(this.handleEvents);

    log.info(
      `Listening for incoming events on chaincode "${this.adapter.config.chaincodeName}" on channel "${this.adapter.config.channel}"...`
    );

    try {
      for await (const evt of this.listeningStack) {
        const { table, event, owner } = parseEventName(evt.eventName);
        if (owner && owner !== this.adapter.config?.mspId) continue;
        const payload: { id: string } = this.parsePayload(evt.payload);
        try {
          const targetModel = table
            ? Model.get(table)
            : Model.get(this.models[0].name);
          const modelRef = targetModel ?? (table || this.models[0]?.name);
          await this.updateObservers(
            modelRef as Constructor | string,
            event,
            payload.id as string,
            ctx
          );
        } catch (e: unknown) {
          log.error(
            `Failed update observables for table ${table} event ${event} id: ${payload.id}: ${e}`
          );
        }
      }
    } catch (e: any) {
      log.error(
        `Failed to read event for chaincode "${this.adapter.config.chaincodeName}" on channel "${this.adapter.config.channel}": ${e}`
      );
      await this.close();
    }
  }

  /**
   * @description Initializes the event listener
   * @summary Sets up the connection to the Fabric network and starts listening for chaincode events
   * @return {Promise<void>} Promise that resolves when initialization is complete
   */
  protected override async initialize(): Promise<void> {
    if (!this.adapter)
      throw new InternalError(`No adapter or config observed for dispatch`);
    const context = this.adapter.context(
      "dispatch",
      {
        correlationId: this.adapter.config.chaincodeName,
      },
      Model as any
    );
    const { ctx } = this.logCtx([context], this.initialize);
    const gateway = await FabricClientAdapter.getGateway(
      ctx,
      this.adapter.config as PeerConfig,
      this.client
    );
    const network = gateway.getNetwork(this.adapter.config.channel);
    if (!this.adapter)
      throw new InternalError(`No adapter observed for dispatch`);
    this.listeningStack = await network.getChaincodeEvents(
      this.adapter.config.chaincodeName
    );
    this.handleEvents(ctx);
  }
}

if (FabricClientAdapter)
  FabricClientAdapter["_baseDispatch"] = FabricClientDispatch;
