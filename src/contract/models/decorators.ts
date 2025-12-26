import { Model } from "@decaf-ts/decorator-validation";
import { metadata, apply } from "@decaf-ts/decoration";
import {
  afterCreate,
  afterDelete,
  afterUpdate,
  InternalError,
  IRepository,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Audit } from "./Audit";
import { Repository } from "@decaf-ts/core";
import { FabricContractContext } from "../../contracts/index";

export async function createAuditHandler<
  M extends Model,
  R extends Repository<M, any>,
  V,
>(
  this: R,
  context: FabricContractContext,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  const repo = Repository.forModel(Audit);

  if (!context.identity || !context.identity.getID)
    throw new InternalError(`Lost context apprently. no getId in identity`);

  const toCreate = new Audit({
    userGroup: context.identity.getID(),
    userId: context.identity.getID(),
    action: OperationKeys.CREATE,
    diffs: new this.class().compare(model),
  });

  const audit = await repo.create(toCreate, context);
  context.logger.info(
    `Audit log for ${OperationKeys.CREATE} of ${Model.tableName(this.class)} created: ${audit.id}: ${JSON.stringify(audit, undefined, 2)}`
  );
}

export async function updateAuditHandler<
  M extends Model,
  R extends IRepository<M, any>,
  V,
>(
  this: R,
  context: FabricContractContext,
  data: V,
  key: keyof M,
  model: M,
  oldModel: M
): Promise<void> {
  if (!context.identity || !context.identity.getID)
    throw new InternalError(`Lost context apprently. no getId in identity`);

  const toCreate = new Audit({
    userGroup: context.identity.getID(),
    userId: context.identity.getID(),
    action: OperationKeys.UPDATE,
    diffs: model.compare(oldModel),
  });

  const repo = Repository.forModel(Audit);
  const audit = await repo.create(toCreate, context);
  context.logger.info(
    `Audit log for ${OperationKeys.UPDATE} of ${Model.tableName(this.class)} created: ${JSON.stringify(audit, undefined, 2)}`
  );
}

export async function deleteAuditHandler<
  M extends Model,
  R extends IRepository<M, any>,
  V,
>(
  this: R,
  context: FabricContractContext,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  if (!context.identity || !context.identity.getID)
    throw new InternalError(`Lost context apprently. no getId in identity`);

  const toCreate = new Audit({
    userGroup: context.identity.getID(),
    userId: context.identity.getID(),
    action: OperationKeys.DELETE,
    diffs: model.compare(new this.class()),
  });

  const repo = Repository.forModel(Audit);
  const audit = await repo.create(toCreate, context);
  context.logger.info(
    `Audit log for ${OperationKeys.DELETE} of ${Model.tableName(this.class)} created: ${JSON.stringify(audit, undefined, 2)}`
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
