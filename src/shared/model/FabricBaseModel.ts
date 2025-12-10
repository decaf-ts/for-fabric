import { Model, ModelArg } from "@decaf-ts/decorator-validation";
import {createdAt, updatedAt} from "@decaf-ts/core"
import {version} from "@decaf-ts/db-decorators"
import { description, uses } from "@decaf-ts/decoration";
import { FabricFlavour } from "../constants";

@uses(FabricFlavour)
export class FabricBaseModel extends Model {

  @description("Stores the original timestamp of creation")
  @createdAt()
  createdAt!: Date;

  @description("Stores the timestamp of the last update")
  @updatedAt()
  updatedAt!: Date;

  @description("Stores the version of the model")
  @version()
  version!: number;

  constructor(arg?: ModelArg<FabricBaseModel>) {
    super(arg);
  }

}