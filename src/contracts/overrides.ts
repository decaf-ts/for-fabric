import { UUID } from "@decaf-ts/core";
import { uuidFromSeed } from "./uuid";

UUID.prototype.generate = function generate(seed: string): Promise<string> {
  return uuidFromSeed(seed);
};
