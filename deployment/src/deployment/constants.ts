/**
 * @module simple-deployment/deployment
 * @description Constants for the fabric-only deployment.
 */

export enum DeploymentPlatform {
  Docker = "docker",
}

export enum DeploymentStage {
  SECRETS = "secrets",
  ROOT_CA = "root-ca",
  PVCS = "pvcs",
  HSM = "hsm",
  CCAAS = "ccaas",
  TLS = "tls",
  CA = "ca",
  COUCHDB = "couchdb",
  TOOLS = "tools",
  ORDERER = "orderer",
  PEER = "peer",
  ON_PREM = "on-prem",
}
