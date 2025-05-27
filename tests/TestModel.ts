import {
  maxlength,
  minlength,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { BaseModel } from "@decaf-ts/core";
import { column, table, unique } from "@decaf-ts/core";
import { pk } from "@decaf-ts/core";

@table("tst_user")
@model()
export class TestModel extends BaseModel {
  @pk()
  id!: number;

  @column("tst_name")
  @required()
  name!: string;

  @column("tst_nif")
  @unique()
  @minlength(9)
  @maxlength(9)
  @required()
  nif!: string;

  constructor(arg?: ModelArg<TestModel>) {
    super(arg);
  }
}
