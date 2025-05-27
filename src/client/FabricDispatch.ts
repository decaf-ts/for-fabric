import { Dispatch } from "@decaf-ts/core";
import { PeerConfig } from "./types";
import { Client } from "@grpc/grpc-js";
import { FabricAdapter } from "./FabricAdapter";
import { InternalError } from "@decaf-ts/db-decorators";
import {
  ChaincodeEvent,
  CloseableAsyncIterable,
} from "@hyperledger/fabric-gateway";
import { parseEventName } from "../shared/events";

export class FabricDispatch extends Dispatch<PeerConfig> {
  private listeningStack?: CloseableAsyncIterable<ChaincodeEvent>;

  private decoder = new TextDecoder("utf8");

  constructor(protected client: Client) {
    super();
  }

  override async close() {
    if (this.listeningStack) this.listeningStack.close();
  }

  private parsePayload(jsonBytes: Uint8Array): { id: string } {
    const json = this.decoder.decode(jsonBytes);
    return JSON.parse(json);
  }

  protected async handleEvents() {
    if (!this.listeningStack)
      throw new InternalError(
        `Event stack not initialized. Ensure that "startListening" is called before attempting this operation.`
      );
    const log = this.log.for(this.handleEvents);
    log.info(
      `Listening for incoming events on chaincode "${this.native?.chaincodeName}" on channel "${this.native?.channel}"...`
    );

    try {
      for await (const evt of this.listeningStack) {
        const { table, event, owner } = parseEventName(evt.eventName);
        if (owner && owner !== this.native?.mspId) continue;
        const payload: { id: string } = this.parsePayload(evt.payload);
        try {
          await this.updateObservers(table, event, payload.id);
        } catch (e: unknown) {
          log.error(
            `Failed update observables for table ${table} event ${event} id: ${payload.id}: ${e}`
          );
        }
      }
    } catch (e: any) {
      log.error(
        `Failed to read event for chaincode "${this.native?.chaincodeName}" on channel "${this.native?.channel}": ${e?.message || e}`
      );
      await this.close();
    }
  }

  protected override async initialize() {
    if (!this.native || this.adapter)
      throw new InternalError(`No adapter or config observed for dispatch`);
    const gateway = await FabricAdapter.getGateway(this.native, this.client);
    const network = gateway.getNetwork(this.native.channel);
    if (!this.adapter)
      throw new InternalError(`No adapter observed for dispatch`);
    this.listeningStack = await network.getChaincodeEvents(
      this.native.chaincodeName
    );
    this.handleEvents();
  }
}
