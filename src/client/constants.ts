import { FabricClientFlags } from "./types";
import { DefaultAdapterFlags } from "@decaf-ts/core";

export const DefaultFabricClientFlags: FabricClientFlags = Object.assign(
  {
    evaluateTimeout: 5,
    endorseTimeout: 15,
    submitTimeout: 5,
    commitTimeout: 60,
  },
  DefaultAdapterFlags
) as any;
