import { Model } from "@decaf-ts/decorator-validation";
import { metadata, apply } from "@decaf-ts/decoration";
import {
  afterCreate,
  afterDelete,
  afterUpdate,
  ContextOfRepository,
  IRepository,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Repository } from "@decaf-ts/core";
import { Audit } from "./Audit";
import {
  FabricContractContext,
  FabricContractRepository,
} from "../../../../src/index";

export async function createAuditHandler<
  M extends Model,
  R extends FabricContractRepository<M>,
  V,
>(
  this: R,
  context: FabricContractContext,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  const repo = Repository.forModel(Audit);
  const identity = context.identity;
  const audit = await repo.create(
    new Audit({
      userGroup: identity.getID(),
      userId: identity.getID(),
      action: OperationKeys.CREATE,
      transaction: context.stub.getTxID(),
      diffs: new this.class().compare(model),
    })
  );
  context.logger.info(
    `Audit log for ${OperationKeys.CREATE} of ${Model.tableName(this.class)} created: ${audit.id}`
  );
}

export async function updateAuditHandler<
  M extends Model,
  R extends IRepository<M, any>,
  V,
>(
  this: R,
  context: ContextOfRepository<R>,
  data: V,
  key: keyof M,
  model: M,
  oldModel: M
): Promise<void> {
  const repo = Repository.forModel(Audit);
  const identity = context.identity;
  const audit = await repo.create(
    new Audit({
      userGroup: identity.getID(),
      userId: identity.getID(),
      action: OperationKeys.UPDATE,
      transaction: context.stub.getTxID(),
      diffs: model.compare(oldModel),
    })
  );
  context.logger.info(
    `Audit log for ${OperationKeys.UPDATE} of ${Model.tableName(this.class)} created: ${audit.id}`
  );
}

export async function deleteAuditHandler<
  M extends Model,
  R extends IRepository<M, any>,
  V,
>(
  this: R,
  context: ContextOfRepository<R>,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  const repo = Repository.forModel(Audit);
  const identity = context.identity;
  const audit = await repo.create(
    new Audit({
      userGroup: identity.getID(),
      userId: identity.getID(),
      action: OperationKeys.DELETE,
      transaction: context.stub.getTxID(),
      diffs: model.compare(new this.class()),
    })
  );
  context.logger.info(
    `Audit log for ${OperationKeys.DELETE} of ${Model.tableName(this.class)} created: ${audit.id}`
  );
}

export function audit() {
  return apply(
    afterCreate(createAuditHandler as any, {}),
    afterUpdate(updateAuditHandler as any, {}),
    afterDelete(deleteAuditHandler as any, {}),
    metadata("audit", true)
  );
}
