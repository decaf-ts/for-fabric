/**
 * @description Hyperledger Fabric Client Module for Decaf-ts
 * @summary This module provides client-side utilities and adapters to interact with Hyperledger Fabric networks using Decaf-ts. It exposes the Fabric client adapter, event dispatch utilities, and filesystem helpers for loading identities and keys.
 * @module client
 * @memberOf module:for-fabric
 * @example
 * // Create a client adapter and submit a transaction
 * // See also: {@link module:for-fabric~FabricClientAdapter} and {@link module:for-fabric~FabricClientDispatch}
 */

export * from "./fabric-fs";
export * from "./FabricClientAdapter";
export * from "./FabricClientDispatch";
export * from "../shared/types";
