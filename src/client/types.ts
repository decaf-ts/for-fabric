import { FabricFlags } from "../shared/index";

export type FabricClientFlags = FabricFlags & {
  evaluateTimeout: number;
  endorseTimeout: number;
  submitTimeout: number;
  commitTimeout: number;
};
