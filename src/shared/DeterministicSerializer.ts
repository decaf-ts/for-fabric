/* eslint-disable @typescript-eslint/no-require-imports */
import { JSONSerializer, Model } from "@decaf-ts/decorator-validation";

/**
 * @description Deterministic JSON serializer for Fabric models
 * @summary Ensures stable, deterministic JSON output by sorting object keys recursively before stringification, which is important for Fabric endorsement and hashing. Extends JSONSerializer to plug into existing Decaf model serialization flow.
 * @template M - The Decaf Model subtype serialized by this instance
 * @param {void} [constructor] No public constructor arguments
 * @class DeterministicSerializer
 * @example
 * const serializer = new DeterministicSerializer<MyModel>();
 * const json = serializer.serialize(model);
 * const rebuilt = serializer.deserialize(json);
 * @mermaid
 * sequenceDiagram
 *   participant Caller
 *   participant DS as DeterministicSerializer
 *   Caller->>DS: serialize(model)
 *   DS->>DS: preSerialize(model)
 *   DS->>DS: sort-keys-recursive
 *   DS->>DS: json-stringify-deterministic
 *   DS-->>Caller: string
 *   Caller->>DS: deserialize(string)
 *   DS-->>Caller: model
 */
export class DeterministicSerializer<
  M extends Model,
> extends JSONSerializer<M> {
  constructor() {
    super();
  }

  /**
   * @description Deserialize a JSON string into a model instance
   * @summary Delegates to the base JSONSerializer implementation to rebuild the model
   * @param {string} str - The JSON string to deserialize
   * @return {M} The reconstructed model instance
   */
  override deserialize(str: string): M {
    return super.deserialize(str);
  }

  /**
   * @description Serialize a model into a deterministic JSON string
   * @summary Prepares the model with preSerialize, sorts keys recursively, and stringifies deterministically for stable ordering
   * @param {M} model - The model instance to serialize
   * @return {string} Deterministic JSON representation of the model
   */
  override serialize(model: M): string {
    const stringify = require("json-stringify-deterministic");
    const sortKeysRecursive = require("sort-keys-recursive");
    return stringify(sortKeysRecursive(this.preSerialize(model)));
  }
}
