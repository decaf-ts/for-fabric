import { ModelConstructor } from "@decaf-ts/decorator-validation";

export type FabricQuery = {
  class: ModelConstructor<any> | string;
  method: string;
  args: any[];
  params?: Record<"limit" | "skip", number>;
};
