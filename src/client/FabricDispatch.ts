import { Dispatch } from "@decaf-ts/core";
import { PeerConfig } from "./types";
export class FabricDispatch extends Dispatch<PeerConfig> {
  constructor() {
    super();
  }

  protected override initialize() {}
}
