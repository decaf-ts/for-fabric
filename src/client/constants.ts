import { FabricClientFlags } from "./types";

export const DefaultFabricClientFlags: FabricClientFlags = {
  evaluateTimeout: 5,
  endorseTimeout: 15,
  submitTimeout: 5,
  commitTimeout: 60,
} as any;
