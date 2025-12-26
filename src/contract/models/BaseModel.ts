import { Model, type ModelArg } from "@decaf-ts/decorator-validation";
import { createdAt, index, OrderDirection, updatedAt } from "@decaf-ts/core";
import { uses } from "@decaf-ts/decoration";
import { version } from "@decaf-ts/db-decorators";
import { FabricFlavour } from "../../shared/index";

@uses(FabricFlavour)
export class BaseModel extends Model {
  @createdAt()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  createdAt!: Date;
  @updatedAt()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  updatedAt!: Date;
  @version()
  version!: number;

  constructor(arg?: ModelArg<BaseModel>) {
    super(arg);
  }
}
