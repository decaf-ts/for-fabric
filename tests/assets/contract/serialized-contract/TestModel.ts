import { column, pk, table, unique } from "@decaf-ts/core";
import {
  maxlength,
  minlength,
  Model,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";

@table("tst_user")
@model()
export class TestModel extends Model {
  @pk({ type: "Number" })
  id!: number;

  @column("tst_name")
  @required()
  name!: string;

  @column("tst_nif")
  // @unique()
  @minlength(9)
  @maxlength(9)
  @required()
  nif!: string;

  constructor(arg?: ModelArg<TestModel>) {
    super(arg);
  }
}
