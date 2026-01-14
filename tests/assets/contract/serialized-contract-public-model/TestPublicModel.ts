import {
  Cascade,
  column,
  oneToMany,
  oneToOne,
  pk,
  table,
} from "@decaf-ts/core";
import {
  maxlength,
  minlength,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { ownedBy } from "../../../../src/shared/decorators";
import { FabricIdentifiedBaseModel } from "../../../../src/shared/model/FabricIdentifiedBaseModel";
import {
  TestPublicModelChild,
  TestPublicModelOtherChild,
} from "./TestPublicModelChild";

@table("tst_user")
@model()
export class TestPublicModel extends FabricIdentifiedBaseModel {
  @pk({ type: "Number", generated: true })
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

  @oneToOne(
    () => TestPublicModelChild,
    {
      update: Cascade.CASCADE,
      delete: Cascade.CASCADE,
    },
    true
  )
  // @required()
  child!: TestPublicModelChild;

  @oneToMany(
    () => TestPublicModelChild,
    {
      update: Cascade.CASCADE,
      delete: Cascade.CASCADE,
    },
    true
  )
  // @required()
  children!: TestPublicModelOtherChild[];

  constructor(arg?: ModelArg<TestPublicModel>) {
    super(arg);
  }
}
