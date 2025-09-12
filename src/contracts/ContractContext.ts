import { Context } from "@decaf-ts/db-decorators";
import { FabricContractFlags } from "./types";
import { ChaincodeStub, ClientIdentity } from "fabric-shim-api";

/**
 * @description Context class for Fabric chaincode operations
 * @summary Provides access to Fabric-specific context elements like stub, identity, and logger to be used by repositories and adapters during contract execution.
 * @template F - Flags specific to Fabric contract operations
 * @param {object} [args] - Optional initialization arguments passed to the base Context
 * @return {void}
 * @class FabricContractContext
 * @example
 * ```typescript
 * // In a Fabric chaincode contract method
 * const context = new FabricContractContext();
 * // Optionally set values via the base Context API
 * context.set('stub', ctx.stub);
 * context.set('clientIdentity', ctx.clientIdentity);
 * context.set('logger', contractLogger);
 *
 * // Access context properties
 * const timestamp = context.timestamp;
 * const creator = context.identity.getID();
 * ```
 * @mermaid
 * sequenceDiagram
 *   participant Contract
 *   participant Context
 *   participant Ledger
 *   Contract->>Context: new FabricContractContext()
 *   Contract->>Context: set('stub'|'clientIdentity'|'logger', ...)
 *   Context-->>Contract: timestamp, identity, logger
 *   Contract->>Ledger: Interact via stub
 */
export class FabricContractContext extends Context<FabricContractFlags> {
  /**
   * @description Creates a new FabricContractContext instance
   * @summary Initializes the context with Fabric-specific flags
   */
  constructor() {
    super();
  }

  /**
   * @description Gets the chaincode stub
   * @summary Returns the ChaincodeStub instance for interacting with the ledger
   * @return {ChaincodeStub} The chaincode stub
   */
  get stub(): ChaincodeStub {
    return this.get("stub");
  }

  /**
   * @description Gets the transaction timestamp
   * @summary Overrides the base timestamp getter to use the stub's timestamp
   * @return {Date} The transaction timestamp
   */
  override get timestamp(): Date {
    return this.stub.getDateTimestamp();
  }

  /**
   * @description Gets the client identity
   * @summary Returns the ClientIdentity instance for the transaction submitter
   * @return {ClientIdentity} The client identity
   */
  get identity(): ClientIdentity {
    return this.get("clientIdentity");
  }

  /**
   * @description Gets the logger
   * @summary Returns the logger instance for the current context
   * @return {any} The logger instance
   */
  get logger() {
    return this.get("logger");
  }
}
