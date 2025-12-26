import { type ModelArg } from "@decaf-ts/decorator-validation";
import { createdBy, index, OrderDirection, updatedBy } from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";
import { BaseModel } from "./BaseModel";
import { FabricFlavour } from "../../shared/index";

@uses(FabricFlavour)
export class BaseIdentifiedModel extends BaseModel {
  @createdBy()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  createdBy!: string;
  @updatedBy()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  updatedBy!: string;

  constructor(arg?: ModelArg<BaseIdentifiedModel>) {
    super(arg);
  }
}
