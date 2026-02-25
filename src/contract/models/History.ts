import {
  JSONSerializer,
  Model,
  model,
  type ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { column, index, OrderDirection, pk, table } from "@decaf-ts/core";
import {
  BlockOperations,
  composed,
  OperationKeys,
  readonly,
  serialize,
} from "@decaf-ts/db-decorators";
import { description, uses } from "@decaf-ts/decoration";
import { FabricFlavour, NamespaceCollection, sharedData } from "../../shared";

@description("Logs user activity for auditing purposes.")
@uses(FabricFlavour)
@BlockOperations([
  OperationKeys.CREATE,
  OperationKeys.UPDATE,
  OperationKeys.DELETE,
])
@table("history")
@sharedData(NamespaceCollection("ptp-history"))
@model()
export class History extends Model {
  @pk()
  @composed(["table", "key", "version"], ":")
  @description("Unique identifier of the history record.")
  id!: string;

  @column()
  @readonly()
  @readonly()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("table this history object refers to")
  table!: string;

  @column()
  @required()
  @readonly()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("id of the original object")
  key!: string;

  @column()
  @required()
  @readonly()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("the version of the original object")
  version!: number;

  @column()
  @required()
  @readonly()
  @serialize(JSONSerializer)
  @description("the object to keep history of")
  record?: Record<string, any>;

  constructor(model?: ModelArg<History>) {
    super(model);
  }
}
