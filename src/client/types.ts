import { FabricFlags } from "../shared/index";

export type FabricClientFlags = FabricFlags & {
  evaluateTimeout: number;
  endorseTimeout: number;
  submitTimeout: number;
  commitTimeout: number;
  endorsingOrgs?: string[];
  keyCertOrDirectoryPath?: string | Buffer;
  certCertOrDirectoryPath?: string | Buffer;
  chaincodeName?: string;
  contractName?: string;
  sizeLimit?: number;
  mspId?: string;
  channel?: string;
};
