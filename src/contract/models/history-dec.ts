import { Model } from "@decaf-ts/decorator-validation";
import { Repository } from "@decaf-ts/core";
import { apply, metadata } from "@decaf-ts/decoration";
import {
  afterDelete,
  InternalError,
  onUpdate,
  OperationKeys,
  PrimaryKeyType,
} from "@decaf-ts/db-decorators";
import { populateRelations } from "./decorators";
import type {
  FabricContractContext,
  FabricContractFlags,
} from "../../contracts/index";
import { History } from "./History";

export async function updateHistoryHandler<
  M extends Model,
  R extends Repository<M, any>,
>(
  this: R,
  context: FabricContractContext,
  data: any,
  key: keyof M,
  model: M,
  oldModel: M
): Promise<void> {
  if (!context.identity || !context.identity.getID)
    throw new InternalError(`Lost context apparently for history`);

  const table = Model.tableName(oldModel);
  const pk: PrimaryKeyType = Model.pk(oldModel, true) as any;
  let version: number;
  try {
    version = Model.versionOf(oldModel as any);
  } catch {
    context.logger.warn(
      `History for ${table}'s ${pk.toString()} could not be created due to missing version`
    );
    return; // model has no @version field — skip history
  }

  // Populate relations on a non-mutating copy of oldModel, then convert to a
  // plain object so no model-anchor (__model) keys appear in the stored JSON.
  const populated = await populateRelations(oldModel, context, this._overrides);
  const record: Record<string, any> = JSON.parse(JSON.stringify(populated));

  const repo = Repository.forModel(History).override(this._overrides);
  const toCreate = new History({
    table,
    key: pk,
    version,
    record,
  });
  const overrides = {
    stub: context.stub,
    identity: context.identity,
    logger: context.logger,
    fullySegregated: true,
  } as Partial<FabricContractFlags>;

  const historyCtx = await this.adapter.context(
    OperationKeys.CREATE,
    overrides,
    History
  );

  const history = await repo.create(toCreate, historyCtx);
  context.logger.info(
    `History for ${table}'s ${pk.toString()} version ${version} stored with id ${history.id}`
  );
}

export async function deleteHistoryHandler<
  M extends Model,
  R extends Repository<M, any>,
>(
  this: R,
  context: FabricContractContext,
  data: any,
  key: keyof M,
  model: M
): Promise<void> {
  if (!context.identity || !context.identity.getID)
    throw new InternalError(`Lost context apparently for history`);

  const table = Model.tableName(model);
  const pk: PrimaryKeyType = Model.pk(model, true) as any;
  let version: number;
  try {
    version = Model.versionOf(model as any);
  } catch {
    context.logger.warn(
      `History for ${table}'s ${pk.toString()} could not be created due to missing version`
    );
    return; // model has no @version field — skip history
  }

  // Populate relations on a non-mutating copy of model, then convert to a
  // plain object so no model-anchor (__model) keys appear in the stored JSON.
  const populated = await populateRelations(model, context, this._overrides);
  const record: Record<string, any> = JSON.parse(JSON.stringify(populated));

  const repo = Repository.forModel(History).override(this._overrides);
  const toCreate = new History({
    table,
    key: pk,
    version,
    record,
  });
  const overrides = {
    stub: context.stub,
    identity: context.identity,
    logger: context.logger,
    fullySegregated: true,
  } as Partial<FabricContractFlags>;

  const historyCtx = await this.adapter.context(
    OperationKeys.CREATE,
    overrides,
    History
  );
  const history = await repo.create(toCreate, historyCtx);
  context.logger.info(
    `History for ${table}'s ${pk.toString()} version ${version} stored with id ${history.id}`
  );
}

export function historyDec() {
  return apply(
    onUpdate(updateHistoryHandler as any, {}, { priority: 99 }),
    afterDelete(deleteHistoryHandler as any, {}, { priority: 99 }),
    metadata("history", true)
  );
}
