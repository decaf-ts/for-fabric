/**
 * @description Certificate Authority role types used during enrollment and registration
 * @summary Enumerates the standard Hyperledger Fabric CA roles that can be assigned to identities when registering with the CA service
 * @enum {string}
 * @readonly
 * @memberOf module:for-fabric.client
 */
export declare enum CA_ROLE {
  /** Administrator role with elevated privileges for managing identities and affiliations */
  ADMIN = "admin",
  /** Standard user role for application clients interacting with the network */
  USER = "user",
  /** Client role typically used for SDK-based interactions and service accounts */
  CLIENT = "client",
}
