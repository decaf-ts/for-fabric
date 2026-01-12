import { FabricIdentifiedBaseModel } from "../../../../src/shared/model/FabricIdentifiedBaseModel";
import { pk, table } from "@decaf-ts/core";
import { description, uses } from "@decaf-ts/decoration";
import {
  max,
  min,
  minlength,
  model,
  ModelArg,
  option,
  required,
  step,
} from "@decaf-ts/decorator-validation";
import { FabricFlavour } from "../../../../src/shared/constants";

@uses(FabricFlavour)
@table("users")
@model()
export class UserModel extends FabricIdentifiedBaseModel {
  @description("The user's internal id")
  @pk()
  id!: number;

  @description("The user's name'")
  @minlength(3)
  @required()
  name!: string;

  @description("The user's surname")
  @minlength(3)
  @required()
  surname!: string;

  @description("The user's sex")
  @option(["M", "F"])
  @required()
  sex!: "M" | "F";

  @description("The user' age")
  @step(1)
  @max(100)
  @min(18)
  @required()
  age!: number;

  constructor(arg?: ModelArg<UserModel>) {
    super(arg);
  }
}
