import { RepositoryFlags } from "@decaf-ts/db-decorators";
import { ChaincodeStub, ClientIdentity } from "fabric-shim-api";
import { Logger } from "@decaf-ts/logging";

/**
 * @description Flags for Fabric chaincode contract operations
 * @summary Extends repository flags with Fabric-specific context elements
 * @interface FabricContractFlags
 * @extends {RepositoryFlags}
 * @memberOf module:fabric.contracts
 */
export interface FabricContractFlags extends RepositoryFlags {
  /**
   * @description Chaincode stub for interacting with the ledger
   */
  stub: ChaincodeStub;

  /**
   * @description Client identity for the transaction submitter
   */
  clientIdentity: ClientIdentity;

  /**
   * @description Logger instance for the contract
   */
  logger: Logger;
}
