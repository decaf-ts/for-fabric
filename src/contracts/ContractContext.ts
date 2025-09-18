import { Context } from "@decaf-ts/db-decorators";
import { FabricContractFlags } from "./types";
import { ChaincodeStub, ClientIdentity } from "fabric-shim-api";

/**
 * @description Context class for Fabric chaincode operations
 * @summary Provides access to Fabric-specific context elements like stub, identity, and logger
 * @template FabricContractFlags - Flags specific to Fabric contract operations
 * @class FabricContractContext
 * @example
 * ```typescript
 * // In a Fabric chaincode contract method
 * const context = new FabricContractContext({
 *   stub: ctx.stub,
 *   identity: ctx.clientIdentity,
 *   logger: contractLogger
 * });
 *
 * // Access context properties
 * const timestamp = context.timestamp;
 * const creator = context.identity.getID();
 * ```
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
    try {
      return this.get("clientIdentity");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_: any) {
      return this.get("identity" as any);
    }
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
