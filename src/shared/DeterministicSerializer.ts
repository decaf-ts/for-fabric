/* eslint-disable @typescript-eslint/no-require-imports */
import { Constructor, Metadata } from "@decaf-ts/decoration";
import {
  JSONSerializer,
  Model,
  ModelKeys,
} from "@decaf-ts/decorator-validation";

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
  protected override preSerialize(model: M) {
    // TODO: nested preserialization (so increase performance when deserializing)
    // TODO: Verify why there is no metadata
    const toSerialize: Record<string, any> = Object.assign({}, model);
    let metadata;
    try {
      metadata = Metadata.modelName(model.constructor as Constructor);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error: unknown) {
      metadata = undefined;
    }
    toSerialize[ModelKeys.ANCHOR] = metadata || model.constructor.name;

    const preSerialize = function preSerialize(
      this: DeterministicSerializer<any>,
      obj: any
    ): any {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      if (typeof obj !== "object") return obj;
      if (Array.isArray(obj)) return obj.map((o) => preSerialize.call(self, o));
      return this.preSerialize.call(this, obj);
    }.bind(this);

    Model.relations(model).forEach((r) => {
      toSerialize[r] = preSerialize(toSerialize[r]);
    });
    return toSerialize;
  }

  /**
   * @summary Rebuilds a model from a serialization
   * @param {string} str
   *
   * @throws {Error} If it fails to parse the string, or to build the model
   */
  override deserialize(str: string): M {
    const deserialization = JSON.parse(str);
    const className = deserialization[ModelKeys.ANCHOR];
    if (!className)
      throw new Error("Could not find class reference in serialized model");
    const model: M = Model.build(deserialization, className) as unknown as M;
    return model;
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
