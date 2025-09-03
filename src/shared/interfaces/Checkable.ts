import { Context } from "fabric-contract-api";

export interface Checkable {
  healthcheck(ctx: Context): Promise<string | boolean>;
}
