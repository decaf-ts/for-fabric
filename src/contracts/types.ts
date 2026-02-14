import { ChaincodeStub, ClientIdentity } from "fabric-shim-api";
import { Logger } from "@decaf-ts/logging";
import { FabricFlags } from "../shared/index";

/**
 * @description Flags for Fabric chaincode contract operations
 * @summary Extends repository flags with Fabric-specific context elements available during Fabric chaincode execution, such as the ChaincodeStub, ClientIdentity and a request-scoped Logger.
 * @template T
 * @param {RepositoryFlags} [base] - Base repository flags that these Fabric-specific flags extend
 * @return {void}
 * @interface FabricContractFlags
 * @memberOf module:fabric.contracts
 */
export interface FabricContractFlags extends FabricFlags {
  /**
   * @description Chaincode stub for interacting with the ledger
   */
  stub: ChaincodeStub;

  /**
   * @description Client identity for the transaction submitter
   */
  identity: ClientIdentity;

  roles?: string[];

  cert: string;

  segregateWrite?: Record<string, string[]>;
  segregateRead?: string | string[];
  forceSegregateWrite?: boolean;
  fullySegregated?: boolean;
  sequenceSegregation?: Map<
    string,
    { fullySegregated: boolean; collections: string[] }
  >;
  segregatedData?: Record<string, Record<string, any>>;

  /**
   * @description Logger instance for the contract
   */
  logger: Logger;
}
