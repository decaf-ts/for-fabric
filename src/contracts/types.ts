import { RepositoryFlags } from "@decaf-ts/db-decorators";
import { ChaincodeStub, ClientIdentity } from "fabric-shim-api";
import { Logger } from "@decaf-ts/logging";

export interface FabricContractFlags extends RepositoryFlags {
  stub: ChaincodeStub;
  clientIdentity: ClientIdentity;
  logger: Logger;
}
