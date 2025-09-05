import { column, pk, table, unique } from "@decaf-ts/core";
import {
  maxlength,
  minlength,
  Model,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";

import { Object as FabricObject, Property } from "fabric-contract-api";

@table("tst_user")
@model()
@FabricObject()
export class TestModel extends Model {
  @pk({ type: "Number" })
  id!: number;

  @column("tst_name")
  @required()
  @Property()
  name!: string;

  @column("tst_nif")
  // @unique()
  @minlength(9)
  @maxlength(9)
  @required()
  @Property()
  nif!: string;

  constructor(arg?: ModelArg<TestModel>) {
    super(arg);
  }
}
