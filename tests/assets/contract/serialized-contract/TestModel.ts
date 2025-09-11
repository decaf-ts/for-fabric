import { column, pk, table } from "@decaf-ts/core";
import {
  maxlength,
  minlength,
  Model,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";

import { privateData } from "../../../../src/shared/decorators";

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

  @column("tst_email")
  @required()
  @privateData("_implicit_org_Peer0OrgaMSP")
  email!: string;

  constructor(arg?: ModelArg<TestModel>) {
    super(arg);
  }
}
