import {
  JSONSerializer,
  Model,
  ModelKeys,
} from "@decaf-ts/decorator-validation";
import { Constructor, Metadata } from "@decaf-ts/decoration";

export class SimpleDeterministicSerializer<
  M extends Model,
> extends JSONSerializer<M> {
  constructor() {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override deserialize(str: string, tableName?: string): M {
    const deserialization = JSON.parse(str);
    // const className = tableName;
    // if (!className)
    //   throw new Error("Could not find class reference in serialized model");

    // // this will return undefined values
    // const model: M = Model.build(deserialization, className) as unknown as M;

    // // Populate Model
    // const processedDesealization = Object.keys(model).reduce(
    //   (accum: M, key) => {
    //     (accum as Record<string, any>)[key] =
    //       deserialization[Repository.column(accum, key)];
    //     return accum;
    //   },
    //   model
    // );

    // const result = Model.build(
    //   processedDesealization,
    //   className
    // ) as unknown as M;

    // return result;
    return deserialization;
  }

  override serialize(model: M, putAnchor = true): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const stringify = require("json-stringify-deterministic");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sortKeysRecursive = require("sort-keys-recursive");
    const preSerialization = this.preSerialize(model, putAnchor);
    return stringify(sortKeysRecursive(preSerialization));
  }

  protected override preSerialize(model: M, putAnchor: boolean = true) {
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
    if (putAnchor)
      toSerialize[ModelKeys.ANCHOR] = metadata || model.constructor.name;

    function preSerialize(
      this: SimpleDeterministicSerializer<any>,
      obj: any
    ): any {
      if (typeof obj !== "object") return obj;
      if (Array.isArray(obj)) return obj.map(preSerialize);
      return this.preSerialize(obj);
    }
    Model.relations(model).forEach((r) => {
      toSerialize[r] = preSerialize.call(this, toSerialize[r]);
    });
    return toSerialize;
  }
}
