import { column, pk, table } from "@decaf-ts/core";
import {
  maxlength,
  minlength,
  Model,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { ownedBy } from "../../../../src/shared/decorators";

@table("tst_user")
@model()
export class TestPublicModel extends Model {
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

  @ownedBy()
  owner!: string;

  constructor(arg?: ModelArg<TestPublicModel>) {
    super(arg);
  }
}
