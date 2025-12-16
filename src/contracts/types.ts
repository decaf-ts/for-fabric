import { AdapterFlags } from "@decaf-ts/core";
import { ChaincodeStub, ClientIdentity } from "fabric-shim-api";
import { Logger } from "@decaf-ts/logging";

/**
 * @description Flags for Fabric chaincode contract operations
 * @summary Extends repository flags with Fabric-specific context elements available during Fabric chaincode execution, such as the ChaincodeStub, ClientIdentity and a request-scoped Logger.
 * @template T
 * @param {RepositoryFlags} [base] - Base repository flags that these Fabric-specific flags extend
 * @return {void}
 * @interface FabricContractFlags
 * @memberOf module:fabric.contracts
 */
export interface FabricContractFlags extends AdapterFlags {
  /**
   * @description Chaincode stub for interacting with the ledger
   */
  stub: ChaincodeStub;

  /**
   * @description Client identity for the transaction submitter
   */
  identity: ClientIdentity;

  /**
   * @description Logger instance for the contract
   */
  logger: Logger;
}
