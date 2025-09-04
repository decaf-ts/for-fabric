import {
  getMetadata,
  JSONSerializer,
  Model,
  ModelKeys,
} from "@decaf-ts/decorator-validation";
import { SerializationError } from "@decaf-ts/db-decorators";

export class ClientSerializer<M extends Model> extends JSONSerializer<M> {
  constructor() {
    super();
  }
  protected override preSerialize(model: M, table?: string) {
    // TODO: nested preserialization (so increase performance when deserializing)
    const toSerialize: Record<string, any> = Object.assign({}, model);
    let metadata;
    try {
      metadata = getMetadata(model);
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
   * @summary Serializes a model
   * @param {M} model
   *
   * @throws {Error} if fails to serialize
   */
  override serialize(model: M, table?: string): string {
    return JSON.stringify(this.preSerialize(model, table));
  }
}
