import { Context } from "@decaf-ts/core";
import { FabricClientFlags } from "./types";

const CLIENT_OVERRIDE_KEYS: (keyof FabricClientFlags)[] = [
  "allowGenerationOverride",
  "allowMirroring",
];

/**
 * @description Fabric client context with a constrained override surface
 * @summary Restricts which cached values are propagated to child contexts or sent
 * back as overrides so only intentional client flags are forwarded.
 */
export class FabricClientContext extends Context<FabricClientFlags> {
  constructor(ctx?: Context<FabricClientFlags>) {
    super(ctx);
  }

  override toOverrides(): Partial<FabricClientFlags> {
    const overrides: Partial<FabricClientFlags> = {};
    for (const key of CLIENT_OVERRIDE_KEYS) {
      const value = this.getOrUndefined(key);
      if (typeof value !== "undefined") {
        overrides[key] = value as never;
      }
    }
    return overrides;
  }
}
