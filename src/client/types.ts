import { LoggingConfig } from "@decaf-ts/logging";

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
  chaincodeName?: string;
  contractName?: string;
  ca?: string;
  msp?: string;
  channel?: string;
};

export type PeerConfigOverride = Pick<
  PeerConfig,
  | "keyDirectoryPath"
  | "certDirectoryPath"
  | "msp"
  | "channel"
  | "chaincodeName"
  | "contractName"
>;

export interface PeerEnvironment extends LoggingConfig {}
