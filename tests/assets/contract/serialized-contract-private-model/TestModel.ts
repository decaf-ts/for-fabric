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

@table("tst_private_user")
@model()
@privateData("_implicit_org_Peer0OrgaMSP")
export class TestPrivateModel extends Model {
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
