import { Context } from "@decaf-ts/db-decorators";
import { FabricContractFlags } from "./types";
import { ChaincodeStub, ClientIdentity } from "fabric-shim-api";

export class FabricContractContext extends Context<FabricContractFlags> {
  constructor(obj: FabricContractFlags) {
    super(obj);
  }

  get stub(): ChaincodeStub {
    return this.get("stub");
  }

  override get timestamp(): Date {
    return this.stub.getDateTimestamp();
  }

  get identity(): ClientIdentity {
    return this.get("clientIdentity");
  }

  get logger() {
    return this.get("logger");
  }
}
