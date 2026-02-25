import { Model } from "@decaf-ts/decorator-validation";
import { metadata, apply, Constructor } from "@decaf-ts/decoration";
import {
  afterCreate,
  afterDelete,
  afterUpdate,
  InternalError,
  onCreate,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Audit } from "./Audit";
import {
  Repo,
  Repository,
  UnsupportedError,
  RelationsMetadata,
} from "@decaf-ts/core";
import { FabricContractContext } from "../../contracts/ContractContext";
import { CollectionResolver } from "../../shared/decorators";
import { GtinOwner } from "./GtinOwner";

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

/**
 * Returns a shallow-cloned copy of the model with relation properties resolved
 * to their full instances. The original model is NOT mutated.
 */
export async function populateRelations<M extends Model>(
  model: M,
  context: FabricContractContext,
  overrides?: Record<string, any>
): Promise<M> {
  // Create a shallow copy preserving the prototype so compare() etc. still work
  const copy = Object.assign(
    Object.create(Object.getPrototypeOf(model)),
    model
  ) as M;
  const relProps = Model.relations(model) as string[];
  if (!relProps || !relProps.length) return copy;
  for (const propKey of relProps) {
    const meta = Model.relations(
      model,
      propKey as keyof M
    ) as RelationsMetadata;
    const clazzOrFn = meta.class;
    const clazz: Constructor<Model> =
      typeof clazzOrFn === "function" && (clazzOrFn as any).name
        ? (clazzOrFn as Constructor<Model>)
        : (clazzOrFn as () => Constructor<Model>)();
    const value = (copy as any)[propKey];
    if (value === null || value === undefined) continue;
    const repo = Repository.forModel(clazz).override(overrides || {});
    if (Array.isArray(value)) {
      const resolved: any[] = [];
      for (const item of value) {
        if (typeof item === "string" || typeof item === "number") {
          try {
            resolved.push(await repo.read(String(item), context));
          } catch {
            resolved.push(item);
          }
        } else {
          resolved.push(item);
        }
      }
      (copy as any)[propKey] = resolved;
    } else if (typeof value === "string" || typeof value === "number") {
      try {
        (copy as any)[propKey] = await repo.read(String(value), context);
      } catch {
        // keep original value if read fails
      }
    }
  }
  return copy;
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

  if (!context.identity || !context.identity.getID)
    throw new InternalError(`Lost context apparently for audit`);

  model = await populateRelations(model, context, this._overrides);

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

  const populatedModel = await populateRelations(
    model,
    context,
    this._overrides
  );
  const populatedOldModel = await populateRelations(
    oldModel,
    context,
    this._overrides
  );

  const toCreate = new Audit({
    userGroup: context.identity.getID(),
    userId: context.identity.getID(),
    model: Model.tableName(data.class),
    transaction: context.stub.getTxID(),
    action: OperationKeys.UPDATE,
    diffs: populatedModel.compare(populatedOldModel),
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

export async function createAssignGtinOwnerHandler<
  M extends Model,
  R extends Repo<M>,
  V,
>(
  this: R,
  context: FabricContractContext,
  data: V,
  key: keyof M,
  model: { productCode: string }
): Promise<void> {
  if (!model.productCode)
    throw new UnsupportedError(`Gtin owner can only be assigned to products`);
  const repo = Repository.forModel(GtinOwner);
  const toCreate = new GtinOwner({
    productCode: model.productCode,
  });
  const owner = await repo.create(toCreate, publicContext(context));
  context.logger.info(
    `GTIN owner assigned for product ${model.productCode}: ${owner.ownedBy}`
  );
}

export async function deleteAssignGtinOwnerHandler<
  M extends Model,
  R extends Repo<M>,
  V,
>(
  this: R,
  context: FabricContractContext,
  data: V,
  key: keyof M,
  model: { productCode: string }
): Promise<void> {
  if (!model.productCode)
    throw new UnsupportedError(`Gtin owner can only be assigned to products`);
  const repo = Repository.forModel(GtinOwner);
  const owner = await repo.delete(model.productCode, publicContext(context));
  context.logger.info(
    `GTIN owner assigned for product ${model.productCode}: ${owner.ownedBy}`
  );
}

export function assignProductOwner() {
  return apply(
    onCreate(createAssignGtinOwnerHandler as any, {}),
    afterDelete(deleteAssignGtinOwnerHandler as any, {})
  );
}

function publicContext(ctx: FabricContractContext) {
  return new (ctx.constructor as any)(ctx).accumulate({
    fullySegregated: false,
    segregated: undefined,
    segregatedData: undefined,
    segregateRead: undefined,
    segregateWrite: undefined,
    segregateReadStack: undefined,
  });
}
