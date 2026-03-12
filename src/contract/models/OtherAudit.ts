import {
  model,
  type ModelArg,
  required,
  type,
} from "@decaf-ts/decorator-validation";
import {
  BlockOperations,
  InternalError,
  OperationKeys,
  readonly,
  serialize,
} from "@decaf-ts/db-decorators";
import { description, uses } from "@decaf-ts/decoration";
import {
  table,
  pk,
  createdBy,
  column,
  OrderDirection,
  index,
  uuid,
  ContextualArgs,
  defaultQueryAttr,
} from "@decaf-ts/core";
import { BaseModel } from "./BaseModel";
import { AuditOperations } from "./constants";
import {
  FabricFlavour,
  mirror,
  NamespaceCollection,
  ownedBy,
  sharedData,
  transactionId,
} from "../../shared/index";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function uuidSeed(m: OtherAudit, ...args: ContextualArgs<any>) {
  try {
    return `${m.model}${m.action}${m.recordId}${m.userId}${m.transaction}${JSON.stringify(m.diffs)}`;
  } catch (e: unknown) {
    throw new InternalError(`Failed to generate deterministic uuid: ${e}`);
  }
}

@description("Logs user activity for auditing purposes.")
@BlockOperations([
  // OperationKeys.CREATE,
  OperationKeys.UPDATE,
  OperationKeys.DELETE,
])
@uses(FabricFlavour)
@sharedData(NamespaceCollection("decaf-namespace"))
@table("audit")
@model()
export class OtherAudit extends BaseModel {
  @pk()
  @uuid(uuidSeed)
  @mirror("mirror-collection", "org-b")
  @description("Unique identifier of the audit record.")
  id!: string;

  @column()
  @required()
  @readonly()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("model/entity affected by the action")
  model!: string;

  @column()
  @required()
  @readonly()
  @type(String)
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Type of action performed by the user.")
  action!: AuditOperations;

  @description("Id from the model recorded in the audit")
  @column()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @required()
  recordId!: string;

  @column()
  @createdBy()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Identifier of the user who performed the action.")
  userId!: string;

  @column()
  @required()
  @readonly()
  @type(String)
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Group or role of the user who performed the action.")
  userGroup!: string;

  @column()
  @required()
  @readonly()
  @transactionId()
  @description("the transaction the audit record was created in")
  transaction!: string;

  @column()
  @readonly()
  @serialize()
  @description("the diffs for the action.")
  diffs?: Record<string, any>;

  @ownedBy()
  @description("the owner (msp) of the audit log")
  owner!: string;

  constructor(model?: ModelArg<OtherAudit>) {
    super(model);
  }
}
