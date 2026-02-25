import { Model } from "@decaf-ts/decorator-validation";
import { metadata, apply, Constructor } from "@decaf-ts/decoration";
import {
  afterCreate,
  afterDelete,
  onUpdate,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { OtherAudit } from "./OtherAudit";
import { Repository } from "@decaf-ts/core";
import { FabricContractContext } from "../../contracts/ContractContext";
import { CollectionResolver } from "../../shared/decorators";
import { populateRelations } from "./decorators";

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
      let segData: any;
      try {
        segData = context.get("segregatedData");
      } catch {
        return; // segregatedData not present in this context (e.g. cascade child)
      }
      if (!segData || !segData[col] || !((model[pk] as any) in segData[col]))
        return;
      Object.assign(model, segData[col][model[pk]]);
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
  const repo = Repository.forModel(OtherAudit);

  if (!context.identity || !context.identity.getID)
    throw new InternalError(`Lost context apparently for audit`);

  model = await populateRelations(model, context, this._overrides);

  const toCreate = new OtherAudit({
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

/**
 * Returns a shallow-cloned copy of the model where each relation array item
 * is normalised to its string ID. This ensures that `{ id: "x" }` and `"x"`
 * compare as equal so that unchanged relations produce no diff.
 */
function normalizeRelationsForAudit<M extends Model>(model: M): M {
  const copy = Object.assign(
    Object.create(Object.getPrototypeOf(model)),
    model
  ) as M;
  const relProps = Model.relations(model) as string[];
  if (!relProps || !relProps.length) return copy;
  for (const propKey of relProps) {
    const value = (copy as any)[propKey];
    if (Array.isArray(value)) {
      (copy as any)[propKey] = value.map((item: any) => {
        if (item == null) return item;
        if (typeof item === "string" || typeof item === "number")
          return String(item);
        if (item.id != null) return String(item.id);
        return item; // new object without id — keep as-is
      });
    } else if (value != null) {
      if (typeof value === "string" || typeof value === "number") {
        (copy as any)[propKey] = String(value);
      } else if ((value as any).id != null) {
        (copy as any)[propKey] = String((value as any).id);
      }
    }
  }
  return copy;
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
  const repo = Repository.forModel(OtherAudit);

  if (!context.identity || !context.identity.getID)
    throw new InternalError(`Lost context apparently for audit`);

  // At onUpdate time `model` still has all private fields (not yet stripped by
  // adapter.revert). Normalise relation arrays to ID strings on both sides so
  // that { id: "x" } and "x" compare as equal and unchanged relations produce
  // no spurious diff.
  const normalizedModel = normalizeRelationsForAudit(model);
  const normalizedOldModel = normalizeRelationsForAudit(oldModel);

  const toCreate = new OtherAudit({
    userGroup: context.identity.getID(),
    userId: context.identity.getID(),
    model: Model.tableName(data.class),
    transaction: context.stub.getTxID(),
    action: OperationKeys.UPDATE,
    diffs: normalizedModel.compare(normalizedOldModel),
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

  model = await populateRelations(model, context, this._overrides);

  const toCreate = new OtherAudit({
    userGroup: context.identity.getID(),
    userId: context.identity.getID(),
    model: Model.tableName(data.class),
    transaction: context.stub.getTxID(),
    action: OperationKeys.DELETE,
    diffs: model.compare(new this.class()),
  });

  const repo = Repository.forModel(OtherAudit);
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
    onUpdate(updateAuditHandler as any, meta),
    afterDelete(deleteAuditHandler as any, meta),
    metadata("audit", true)
  );
}
