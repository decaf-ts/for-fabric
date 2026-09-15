export type ToolsConfig = Pick<ServiceConfig, "image">;

export type BaseServiceConfig = {
  image: string;
  url?: string;
  port: number;
};

export type ServiceConfig = BaseServiceConfig & {
  operationsAddress: string;
  csrHosts: string;
  user: string;
  secret: string;
  admin?: string;
  adminSecret?: string;
  osnPort?: number;
  chaincodePort?: number;
  couchdbUser?: string;
  couchdbSecret?: string;
  couchdbPort?: number;
  couchdbImage?: string;
  adminCsrHosts?: string;
  host?: string;
};

export type OrgConfig = {
  country: string;
  state: string;
  locality: string;
  organization: string;
  organizationUnit: string;
};

export type HSMConfig = {
  enabled: boolean;
  lib: string;
  label: string;
  pin: number;
  altId: string;
  soPin: number;
};

export type ChannelConfig = {
  profile: string;
  name: string;
};

export type ContractConfig = {
  name: string;
  secret: string;
  user: string;
  image: string;
  port: number;
  csrHosts: string;
  tag: string;
  update: boolean;
  version: string;
  maxRecvMsgSize: number;
  maxSendMsgSize: number;
};

export type InfrastructureConfig = {
  logLevel: string;
  onPrem: boolean;
  participatingOrgs: string;
  dockerSocketPath: string;
  deploymentPlatform: string;
  orgName: string;
  orgDomain: string;
  enableCollections: boolean;
  dockerComposePath: string;
  tools: ToolsConfig;
  tls: ServiceConfig;
  org: OrgConfig;
  ca: ServiceConfig;
  hsm: HSMConfig;
  orderer0: ServiceConfig;
  orderer1: ServiceConfig;
  orderer2: ServiceConfig;
  peer0: ServiceConfig;
  peer1: ServiceConfig;
  peer2: ServiceConfig;
  channel: ChannelConfig;
  onPremChannel: ChannelConfig;
  contract: ContractConfig;
  onPremContract: ContractConfig;
};

export type PLAConfig = {
  orgName: string;
  peerAddress: string;
  ordererAddress: string;
  tlsPort: number;
  ordererPort: number;
  toolsAddress: string;
};

export type OnboardConfig = {
  logLevel: string;
  onPrem: boolean;
  enableCollections: boolean;
  dockerSocketPath: string;
  deploymentPlatform: string;
  orgName: string;
  dockerComposePath: string;
  tools: ToolsConfig;
  tls: ServiceConfig;
  org: OrgConfig;
  ca: ServiceConfig;
  hsm: HSMConfig;
  peer0: ServiceConfig;
  channel: ChannelConfig;
  onPremChannel: ChannelConfig;
  contract: ContractConfig;
  onPremContract: ContractConfig;
  pla: PLAConfig;
};
