/* eslint-disable @typescript-eslint/no-require-imports */
import { Repository } from "@decaf-ts/core";
import { JSONSerializer, Model } from "@decaf-ts/decorator-validation";

export class SimpleDeterministicSerializer<
  M extends Model,
> extends JSONSerializer<M> {
  constructor() {
    super();
  }

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

  override serialize(model: M): string {
    const stringify = require("json-stringify-deterministic");
    const sortKeysRecursive = require("sort-keys-recursive");
    return stringify(sortKeysRecursive(this.preSerialize(model)));
  }

  override preSerialize(model: M): Record<string, any> {
    const toSerialize: Record<string, any> = Object.assign({}, model);
    return toSerialize;
  }
}
