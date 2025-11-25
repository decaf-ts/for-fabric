/**
 * @description Contracts submodule for Hyperledger Fabric integration
 * @summary Aggregates chaincode-side building blocks including repositories, sequences, adapters, and ERC20 helpers. This entrypoint re-exports contract-related elements such as {@link FabricContractRepository}, {@link FabricContractSequence}, and CRUD/ERC20 utilities for composing Fabric contracts.
 * @namespace contracts
 * @memberOf module:for-fabric
 */

export * from "./crud";
export * from "./erc20";
export * from "./ContractAdapter";
export * from "./ContractContext";
export * from "./FabricContractRepository";
export * from "./FabricContractRepositoryObservableHandler";
export * from "./FabricContractSequence";
export * from "./logging";
export * from "./types";
