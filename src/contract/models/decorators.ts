import { Model } from "@decaf-ts/decorator-validation";
import { metadata, apply, Constructor } from "@decaf-ts/decoration";
import {
  afterCreate,
  afterDelete,
  afterUpdate,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Audit } from "./Audit";
import { Repository } from "@decaf-ts/core";
import { FabricContractContext } from "../../contracts/ContractContext";
import { CollectionResolver } from "../../shared/decorators";

export async function rebuildForMatchingCollection<M extends Model>(
  model: M,
  context: any,
  collections: {
    privateCols: (string | CollectionResolver)[];
    sharedCols: (string | CollectionResolver)[];
  }
) {
  const mapToCollections =
    collections && (collections.privateCols || collections.sharedCols);
  let cols: string[] | undefined = undefined;
  if (mapToCollections) {
    const msp = Model.ownerOf(model) || (await context.stub.getCreator()).mspid;
    cols = [
      ...new Set(
        [...collections.privateCols, ...collections.sharedCols].map((col) => {
          return typeof col === "string"
            ? col
            : (col as CollectionResolver)(model, msp);
        })
      ),
    ];

    const pk = Model.pk(model);

    cols.forEach((col) => {
      const segData = context.get("segregatedData");
      Object.assign(model, (segData as any)[col][model[pk]]);
    });
  }
  return model;
}

export async function createAuditHandler<
  M extends Model,
  R extends Repository<M, any>,
>(
  this: R,
  context: FabricContractContext,
  data: AuditMetadata,
  key: keyof M,
  model: M
): Promise<void> {
  const repo = Repository.forModel(Audit);

  const collections = Model.collectionsFor(Audit);
  //
  // model = await rebuildForMatchingCollection(model, context, collections);

  if (!context.identity || !context.identity.getID)
    throw new InternalError(`Lost context apparently for audit`);

  const toCreate = new Audit({
    userGroup: context.identity.getID(),
    userId: context.identity.getID(),
    model: Model.tableName(data.class),
    transaction: context.stub.getTxID(),
    action: OperationKeys.CREATE,
    diffs: new this.class().compare(model),
  });

  const audit = await repo.override(this._overrides).create(toCreate, context);
  context.logger.info(
    `Audit log for ${OperationKeys.CREATE} of ${Model.tableName(this.class)} created: ${audit.id}: ${JSON.stringify(audit, undefined, 2)}`
  );
}

export async function updateAuditHandler<
  M extends Model,
  R extends Repository<M, any>,
>(
  this: R,
  context: FabricContractContext,
  data: AuditMetadata,
  key: keyof M,
  model: M,
  oldModel: M
): Promise<void> {
  const repo = Repository.forModel(Audit);

  const collections = Model.collectionsFor(Audit);
  //
  // model = await rebuildForMatchingCollection(model, context, collections);

  if (!context.identity || !context.identity.getID)
    throw new InternalError(`Lost context apparently for audit`);

  const toCreate = new Audit({
    userGroup: context.identity.getID(),
    userId: context.identity.getID(),
    model: Model.tableName(data.class),
    transaction: context.stub.getTxID(),
    action: OperationKeys.UPDATE,
    diffs: model.compare(oldModel),
  });

  const audit = await repo.override(this._overrides).create(toCreate, context);
  context.logger.info(
    `Audit log for ${OperationKeys.UPDATE} of ${Model.tableName(this.class)} created: ${JSON.stringify(audit, undefined, 2)}`
  );
}

export async function deleteAuditHandler<
  M extends Model,
  R extends Repository<M, any>,
>(
  this: R,
  context: FabricContractContext,
  data: AuditMetadata,
  key: keyof M,
  model: M
): Promise<void> {
  if (!context.identity || !context.identity.getID)
    throw new InternalError(`Lost context apprently. no getId in identity`);

  const toCreate = new Audit({
    userGroup: context.identity.getID(),
    userId: context.identity.getID(),
    model: Model.tableName(data.class),
    transaction: context.stub.getTxID(),
    action: OperationKeys.DELETE,
    diffs: model.compare(new this.class()),
  });

  const repo = Repository.forModel(Audit);
  const audit = await repo.override(this._overrides).create(toCreate, context);
  context.logger.info(
    `Audit log for ${OperationKeys.DELETE} of ${Model.tableName(this.class)} created: ${JSON.stringify(audit, undefined, 2)}`
  );
}

export type AuditMetadata = {
  class: Constructor<Model>;
};

export function audit(model: Constructor<Model<boolean>>) {
  const meta: AuditMetadata = {
    class: model,
  };
  return apply(
    afterCreate(createAuditHandler as any, meta),
    afterUpdate(updateAuditHandler as any, meta),
    afterDelete(deleteAuditHandler as any, meta),
    metadata("audit", true)
  );
}
