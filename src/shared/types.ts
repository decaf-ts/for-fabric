import { TLSOptions } from "fabric-ca-client";
import { ClientIdentity } from "fabric-shim-api";
import { Model } from "@decaf-ts/decorator-validation";
import { AdapterFlags } from "@decaf-ts/core";
import { Logger } from "@decaf-ts/logging";

export type HSMOptions = {
  library: string;
  slot?: number;
  tokenLabel?: string;
  pin: string;
  keyLabel?: string;
  keyIdHex?: string;
};

/**
 * @description Configuration for connecting to a Hyperledger Fabric peer
 * @summary Contains all the necessary parameters to establish a connection to a Fabric peer and interact with chaincode
 * @typedef {Object} PeerConfig
 * @property {string} cryptoPath - Path to the crypto materials
 * @property {string} keyCertOrDirectoryPath - Key file contents or Path to the directory containing private keys
 * @property {string} certCertOrDirectoryPath - Cert file contents or Path to the directory containing certificates
 * @property {string} tlsCert - Path to the TLS certificate
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
 * @memberOf module:for-fabric.shared
 */
export type PeerConfig = {
  cryptoPath: string;
  keyCertOrDirectoryPath: string | Buffer;
  certCertOrDirectoryPath: string | Buffer;
  tlsCert: string | Buffer;
  peerEndpoint: string;
  peerHostAlias: string;
  caEndpoint?: string;
  caTlsCertificate?: string;
  caCert?: string;
  caKey?: string;
  chaincodeName: string;
  contractName?: string;
  sizeLimit?: number;
  ca?: string;
  mspId: string;
  channel: string;
  evaluateTimeout: number;
  endorseTimeout: number;
  submitTimeout: number;
  commitTimeout: number;
  hsm?: HSMOptions;
};

/**
 * @description Configuration for connecting to a Hyperledger Fabric peer
 * @summary Contains all the necessary parameters to establish a connection to a Fabric peer and interact with chaincode
 * @typedef {Object} CAConfig
 * @property {string} url - Path to the crypto materials
 * @property {TLSOptions} tls - Path to the directory containing private keys
 * @property {string} caName - Path to the directory containing certificates
 * @property {string} tlsCertPath - Path to the TLS certificate
 * @property {string} caCert - Endpoint URL for the peer
 * @property {string} [caKey] - Host alias for the peer or directory containing the admin private key
 * @memberOf module:for-fabric.shared
 */
export type CAConfig = {
  url: string;
  tls?: TLSOptions;
  caName: string;
  caCert: string;
  caKey?: string;
  hsm?: HSMOptions;
};

/**
 * @description User credentials for CA enrollment or access
 * @summary Optional username/password pair used when enrolling with a Fabric CA or authenticating in client utilities
 * @interface Credentials
 * @property {string} [userName] - Optional username
 * @property {string} [password] - Optional password
 * @memberOf module:for-fabric.shared
 */
export interface Credentials {
  userName?: string;
  password?: string;
}

export type SegregatedModel<M extends Model> = {
  model: M;
  transient?: Record<keyof M, any>;
  privates?: Record<keyof M, any>;
  shared?: Record<keyof M, any>;
};

export type FabricFlags<LOG extends Logger = Logger> = AdapterFlags<LOG> & {
  segregated?: string;
  identity?: string | ClientIdentity;
};
