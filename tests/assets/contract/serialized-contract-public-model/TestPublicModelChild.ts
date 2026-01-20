import { column, pk, table } from "@decaf-ts/core";
import { model, ModelArg, required } from "@decaf-ts/decorator-validation";
import { ownedBy } from "../../../../src/shared/decorators";
import { FabricIdentifiedBaseModel } from "../../../../src/shared/model/FabricIdentifiedBaseModel";

@table("tst_user_child")
@model()
export class TestPublicModelChild extends FabricIdentifiedBaseModel {
  @pk({ type: Number, generated: true })
  id!: number;

  @column("tst_name")
  @required()
  name!: string;

  @ownedBy()
  owner!: string;

  constructor(arg?: ModelArg<TestPublicModelChild>) {
    super(arg);
  }
}

@table("tst_user_other_child")
@model()
export class TestPublicModelOtherChild extends FabricIdentifiedBaseModel {
  @pk({ type: Number, generated: true })
  id!: number;

  @column("tst_name")
  @required()
  name!: string;

  @ownedBy()
  owner!: string;

  constructor(arg?: ModelArg<TestPublicModelChild>) {
    super(arg);
  }
}
