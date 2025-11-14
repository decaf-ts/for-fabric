import {
  JSONSerializer,
  Model,
  ModelKeys,
} from "@decaf-ts/decorator-validation";
import { SerializationError } from "@decaf-ts/db-decorators";
import { Constructor, Metadata } from "@decaf-ts/decoration";

/**
 * @description Client-side JSON serializer for Decaf models targeting Hyperledger Fabric
 * @summary Extends the base JSONSerializer to embed model metadata (anchor) required to reconstruct instances on the client, and to safely serialize/deserialize Fabric-bound models.
 * @template M extends Model - The Decaf model type handled by this serializer
 * @param {void} [constructor] No public constructor arguments; provided for documentation completeness
 * @return {void}
 * @class ClientSerializer
 * @example
 * const serializer = new ClientSerializer<User>();
 * const json = serializer.serialize(new User({ id: "1", name: "Alice" }));
 * const user = serializer.deserialize(json);
 * @mermaid
 * sequenceDiagram
 *   participant App
 *   participant Serializer as ClientSerializer
 *   participant Model
 *   App->>Serializer: serialize(model)
 *   Serializer->>Serializer: preSerialize(model)
 *   Serializer-->>App: JSON string
 *   App->>Serializer: deserialize(json)
 *   Serializer->>Serializer: JSON.parse(json)
 *   Serializer->>Model: Model.build(parsed, anchor)
 *   Model-->>App: instance
 */
export class ClientSerializer<M extends Model> extends JSONSerializer<M> {
  constructor() {
    super();
  }
  /**
   * @description Prepare a model for JSON serialization embedding class anchor
   * @summary Clones the model and injects the class metadata anchor so it can be reconstructed during deserialization. Falls back to provided table name if metadata is not available.
   * @template M - Model type handled by this serializer
   * @param {M} model - The model instance to serialize
   * @param {string} [table] - Optional table name to use when metadata cannot be derived
   * @return {Record<string, any>} A plain object ready to be JSON.stringify'd
   */
  protected override preSerialize(model: M, table?: string) {
    // TODO: nested preserialization (so increase performance when deserializing)
    const toSerialize: Record<string, any> = Object.assign({}, model);
    let metadata;
    try {
      metadata = Metadata.get(model.constructor as Constructor<M>);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      metadata = table;
    }
    if (!metadata)
      throw new SerializationError(
        `Could not find metadata for ${model.constructor.name}`
      );
    toSerialize[ModelKeys.ANCHOR] = metadata;
    return toSerialize;
  }

  /**
   * @description Rebuilds a model from its JSON serialization
   * @summary Parses the JSON string, retrieves the embedded model anchor, and uses Model.build to reconstruct the original instance
   * @param {string} str - The JSON string previously produced by serialize
   * @return {M} The reconstructed model instance
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
   * @description Serializes a model to a JSON string
   * @summary Prepares the model via preSerialize, embedding metadata needed for reconstruction, and returns a JSON string representation
   * @param {M} model - The model instance to serialize
   * @param {string} [table] - Optional table name to include as anchor when metadata is unavailable
   * @return {string} A JSON string containing the serialized model with anchor metadata
   */
  override serialize(model: M, table?: string): string {
    return JSON.stringify(this.preSerialize(model, table));
  }
}
