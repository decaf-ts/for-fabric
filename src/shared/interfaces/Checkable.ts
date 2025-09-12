import { Context } from "fabric-contract-api";

/**
 * @description Interface for health-check capable contracts/services
 * @summary Provides a standard healthcheck method signature to probe liveness/readiness of Fabric contracts or services using a Fabric context
 * @param {Context} ctx - Fabric transaction context used for performing the health check
 * @return {Promise<string|boolean>} A message describing health or a boolean status
 * @interface Checkable
 * @memberOf module:fabric.shared
 */
export interface Checkable {
  healthcheck(ctx: Context): Promise<string | boolean>;
}
