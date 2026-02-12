import { FabricClientFlags } from "./types";

export const DefaultFabricClientFlags: FabricClientFlags = Object.assign({
  evaluateTimeout: 5,
  endorseTimeout: 15,
  submitTimeout: 5,
  commitTimeout: 60,
  legacy: false,
  allowManualEndorsingOrgs: false,
  allowGatewayOverride: false,
  rebuildWithTransient: true,
  encryptTransient: false,
}) as any;
