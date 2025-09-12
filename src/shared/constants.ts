/**
 * @description Keys used to mark Fabric-specific model metadata
 * @summary Enumeration of special keys used by the serialization layer to persist Fabric-related flags on models
 * @enum {string}
 * @readonly
 * @memberOf module:for-fabric.shared
 */
export enum FabricModelKeys {
  /** Private data marker used to tag properties or models for Fabric private collections */
  PRIVATE = "private",
  /** Namespace prefix used for Fabric-specific metadata keys */
  FABRIC = "fabric.",
}
/**
 * @description Supported identity types for Fabric credentials
 * @summary Enumeration of identity formats recognized by this library
 * @enum {string}
 * @readonly
 * @memberOf module:for-fabric.shared
 */
export enum IdentityType {
  /** Standard X.509 identity format used by Hyperledger Fabric */
  X509 = "X.509",
}

/**
 * @description String identifier for the Fabric adapter flavour
 * @summary Used to tag adapters/repositories that operate against Hyperledger Fabric
 * @const FabricFlavour
 * @memberOf module:for-fabric.shared
 */
export const FabricFlavour = "hlf-fabric";

/**
 * @description Package version placeholder replaced at build time
 * @summary Constant holding the current package version injected by the build pipeline
 * @const VERSION
 * @memberOf module:for-fabric.shared
 */
export const VERSION = "##VERSION##";
