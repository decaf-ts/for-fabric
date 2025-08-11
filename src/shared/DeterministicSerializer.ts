import { JSONSerializer, model, Model } from "@decaf-ts/decorator-validation";
import stringify from "json-stringify-deterministic";
import sortKeysRecursive from "sort-keys-recursive";

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
    return stringify(sortKeysRecursive(this.preSerialize(model)));
  }
}
