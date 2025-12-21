import { Model, type ModelArg } from "@decaf-ts/decorator-validation";
import { column, createdAt, updatedAt } from "@decaf-ts/core";
import { version } from "@decaf-ts/db-decorators";
import { description, uses } from "@decaf-ts/decoration";
import { FabricFlavour } from "../constants";
import { Property } from "fabric-contract-api";

@uses(FabricFlavour)
export class FabricBaseModel extends Model {
  @description("Stores the original timestamp of creation")
  @column()
  @createdAt()
  createdAt!: Date;

  @description("Stores the timestamp of the last update")
  @column()
  @updatedAt()
  updatedAt!: Date;

  @description("Stores the version of the model")
  @column()
  @version()
  version!: number;

  constructor(arg?: ModelArg<FabricBaseModel>) {
    super(arg);
  }
}
