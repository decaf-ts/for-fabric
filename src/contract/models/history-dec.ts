import { Model } from "@decaf-ts/decorator-validation";
import { Repository } from "@decaf-ts/core";
import { apply, metadata } from "@decaf-ts/decoration";
import {
  afterDelete,
  InternalError,
  onUpdate,
  PrimaryKeyType,
} from "@decaf-ts/db-decorators";
import { rebuildForMatchingCollection } from "./decorators";
import { type FabricContractContext } from "../../contracts/index";
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
  const repo = Repository.forModel(History).override(this._overrides);

  const collections = Model.collectionsFor(oldModel);

  model = await rebuildForMatchingCollection(oldModel, context, collections);

  if (!context.identity || !context.identity.getID)
    throw new InternalError(`Lost context apparently for audit`);

  const table = Model.tableName(oldModel);
  const pk: PrimaryKeyType = Model.pk(model, true) as any;
  const version = Model.versionOf(oldModel);
  const toCreate = new History({
    table,
    key: pk,
    version,
    record: model,
  });

  await repo.create(toCreate, context);
  context.logger.info(
    `History for ${table}'s ${pk.toString()} version ${version} stored`
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
  const repo = Repository.forModel(History).override(this._overrides);

  const collections = Model.collectionsFor(model);

  model = await rebuildForMatchingCollection(model, context, collections);

  if (!context.identity || !context.identity.getID)
    throw new InternalError(`Lost context apparently for audit`);

  const table = Model.tableName(model);
  const pk: PrimaryKeyType = Model.pk(model, true) as any;
  const version = Model.versionOf(model);
  const toCreate = new History({
    table,
    key: pk,
    version,
    record: model,
  });

  await repo.create(toCreate, context);
  context.logger.info(
    `History for ${table}'s ${pk.toString()} version ${version} stored`
  );
}

export function historyDec() {
  return apply(
    onUpdate(updateHistoryHandler as any, {}, { priority: 99 }),
    afterDelete(deleteHistoryHandler as any, {}, { priority: 99 }),
    metadata("history", true)
  );
}
