import { BaseModel, index, pk, table } from "@decaf-ts/core";
import { model, ModelArg, required } from "@decaf-ts/decorator-validation";
import { CouchDBKeys } from "@decaf-ts/for-couchdb";

@table(CouchDBKeys.SEQUENCE)
@model()
export class CustomizableSequence extends BaseModel {
  /**
   * @description The unique identifier for the sequence
   * @summary Primary key for the sequence record
   */
  @pk()
  id!: string;

  /**
   * @description The current value of the sequence
   * @summary Current sequence value that can be incremented
   */
  @required()
  @index()
  current!: string | number;

  constructor(seq?: ModelArg<CustomizableSequence>) {
    super(seq);
  }
}
