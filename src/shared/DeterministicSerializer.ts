/* eslint-disable @typescript-eslint/no-require-imports */
import { JSONSerializer, Model } from "@decaf-ts/decorator-validation";

export class DeterministicSerializer<
  M extends Model,
> extends JSONSerializer<M> {
  constructor() {
    super();
  }

  override deserialize(str: string): M {
    return super.deserialize(str);
  }

  override serialize(model: M): string {
    const stringify = require("json-stringify-deterministic");
    const sortKeysRecursive = require("sort-keys-recursive");
    return stringify(sortKeysRecursive(this.preSerialize(model)));
  }
}
