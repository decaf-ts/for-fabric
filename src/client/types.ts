import { LoggingConfig } from "@decaf-ts/logging";
import { RepositoryFlags } from "@decaf-ts/db-decorators";

/**
 * @description Configuration for connecting to a Hyperledger Fabric peer
 * @summary Contains all the necessary parameters to establish a connection to a Fabric peer and interact with chaincode
 * @typedef {Object} PeerConfig
 * @property {string} cryptoPath - Path to the crypto materials
 * @property {string} keyDirectoryPath - Path to the directory containing private keys
 * @property {string} certDirectoryPath - Path to the directory containing certificates
 * @property {string} tlsCertPath - Path to the TLS certificate
 * @property {string} peerEndpoint - Endpoint URL for the peer
 * @property {string} peerHostAlias - Host alias for the peer
 * @property {string} caEndpoint - Endpoint URL for the certificate authority
 * @property {string} caTlsCertificate - TLS certificate for the certificate authority
 * @property {string} caCert - Certificate for the certificate authority
 * @property {string} caKey - Key for the certificate authority
 * @property {string} chaincodeName - Name of the chaincode to interact with
 * @property {string} [contractName] - Optional name of the specific contract within the chaincode
 * @property {string} [ca] - Optional certificate authority name
 * @property {string} mspId - Membership Service Provider ID
 * @property {string} channel - Channel name
 * @memberOf module:fabric-client
 */
export type PeerConfig = {
  cryptoPath: string;
  keyDirectoryPath: string;
  certDirectoryPath: string;
  tlsCertPath: string;
  peerEndpoint: string;
  peerHostAlias: string;
  caEndpoint: string;
  caTlsCertificate: string;
  caCert: string;
  caKey: string;
  chaincodeName: string;
  contractName?: string;
  ca?: string;
  mspId: string;
  channel: string;
};

/**
 * @description Subset of PeerConfig properties that can be overridden
 * @summary Selected configuration properties that can be modified without changing the entire configuration
 * @typedef {Object} PeerConfigOverride
 * @property {string} keyDirectoryPath - Path to the directory containing private keys
 * @property {string} certDirectoryPath - Path to the directory containing certificates
 * @property {string} mspId - Membership Service Provider ID
 * @property {string} channel - Channel name
 * @property {string} chaincodeName - Name of the chaincode to interact with
 * @property {string} [contractName] - Optional name of the specific contract within the chaincode
 * @memberOf module:fabric-client
 */
export type PeerConfigOverride = Pick<
  PeerConfig,
  | "keyDirectoryPath"
  | "certDirectoryPath"
  | "mspId"
  | "channel"
  | "chaincodeName"
  | "contractName"
>;

/**
 * @description Environment configuration for Fabric peer interactions
 * @summary Extends the logging configuration for Fabric peer environments
 * @interface PeerEnvironment
 * @extends {LoggingConfig}
 * @memberOf module:fabric-client
 */
export interface PeerEnvironment extends LoggingConfig {}

/**
 * @description Flags for Fabric operations
 * @summary Combines repository flags with peer configuration overrides
 * @interface FabricFlags
 * @extends {RepositoryFlags}
 * @extends {PeerConfigOverride}
 * @memberOf module:fabric-client
 */
export interface FabricFlags extends RepositoryFlags, PeerConfigOverride {}
