import { Context } from "fabric-contract-api";

/**
 * @description Interface for health-check capable contracts/services
 * @summary Provides a standard healthcheck method signature to probe liveness/readiness of Fabric contracts or services using a Fabric context
 * @param {Context} ctx - Fabric transaction context used for performing the health check
 * @return {Promise<string|boolean>} A message describing health or a boolean status
 * @interface Checkable
 * @memberOf module:for-fabric.shared
 */
export interface Checkable {
  /**
   * @description Perform a health check using the Fabric transaction context
   * @summary Allows implementers to report readiness/liveness information that can be a textual message or a boolean status
   * @param {Context} ctx - Fabric transaction context reference used during the check
   * @return {Promise<string|boolean>} A string message describing health or a boolean indicating healthy/unhealthy
   */
  healthcheck(ctx: Context): Promise<string | boolean>;
}
