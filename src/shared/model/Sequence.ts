import { BaseModel, index, pk, table } from "@decaf-ts/core";
import { model, ModelArg, required } from "@decaf-ts/decorator-validation";
import { CouchDBKeys } from "@decaf-ts/for-couchdb";

@table(CouchDBKeys.SEQUENCE)
@model()
export class SequenceModel extends BaseModel {
  /**
   * @description Primary key identifier for the sequence
   */
  @pk()
  id!: string;

  /**
   * @description Current value of the sequence
   * Used to generate the next sequential value
   */
  @required()
  @index()
  current!: string | number;

  constructor(seq?: ModelArg<SequenceModel>) {
    super(seq);
  }
}
