import { type ModelArg } from "@decaf-ts/decorator-validation";
import { column, createdBy, updatedBy } from "@decaf-ts/core";
import { description, uses } from "@decaf-ts/decoration";
import { FabricFlavour } from "../constants";
import { FabricBaseModel } from "./FabricBaseModel";

@uses(FabricFlavour)
export abstract class FabricIdentifiedBaseModel extends FabricBaseModel {
  @description("Stores the creator")
  @column()
  @createdBy()
  createdBy!: string;

  @description("Stores the user that last updated the model")
  @column()
  @updatedBy()
  updatedBy!: string;

  protected constructor(arg?: ModelArg<FabricIdentifiedBaseModel>) {
    super(arg);
  }
}
