import { LoggingConfig } from "@decaf-ts/logging";
import { TLSOptions } from "fabric-ca-client";
import FabricCAService from "fabric-ca-client";
import { CertificateService } from "./fabric-shims";

export type FabricCAServices = FabricCAService & {
  newCertificateService: () => CertificateService;
};

export type PeerConfig = {
  cryptoPath: string;
  keyDirectoryPath: string;
  certDirectoryPath: string;
  tlsCertPath: string;
  peerEndpoint: string;
  peerHostAlias: string;
  chaincodeName?: string;
  contractName?: string;
  msp?: string;
  channel?: string;
  caName?: string;
  caEndpoint: string;
  caTlsCertificate: string;
  caCert: string;
  caKey: string;
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

export type CAConfig = Pick<
  PeerConfig,
  "caEndpoint" | "caName" | "caTlsCertificate" | "caCert" | "caKey"
> & {
  tls?: TLSOptions;
};
