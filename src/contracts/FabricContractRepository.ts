import { Repository, ObserverHandler, EventIds, table } from "@decaf-ts/core";
import { FabricContractAdapter } from "./ContractAdapter";
import { FabricContractFlags } from "./types";
import { FabricContractContext } from "./ContractContext";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import { FabricContractRepositoryObservableHandler } from "./FabricContractRepositoryObservableHandler";
import { BulkCrudOperationKeys, OperationKeys } from "@decaf-ts/db-decorators";

export class FabricContractRepository<M extends Model> extends Repository<
  M,
  MangoQuery,
  FabricContractAdapter,
  FabricContractFlags,
  FabricContractContext
> {
  constructor(
    adapter?: FabricContractAdapter,
    clazz?: Constructor<M>,
    protected trackedEvents?: (OperationKeys | BulkCrudOperationKeys | string)[]
  ) {
    super(adapter, clazz);
  }

  override ObserverHandler(): ObserverHandler {
    return new FabricContractRepositoryObservableHandler();
  }

  override async create(model: M, ...args: any[]): Promise<M> {
    // eslint-disable-next-line prefer-const
    let { record, id, transient } = this.adapter.prepare(model, this.pk);
    record = await this.adapter.create(
      this.tableName,
      id,
      record,
      transient || {},
      ...args
    );
    let c: FabricContractContext | undefined = undefined;
    if (args.length) c = args[args.length - 1] as FabricContractContext;
    return this.adapter.revert<M>(
      record,
      this.class,
      this.pk,
      id,
      c && c.get("rebuildWithTransient") ? transient : undefined
    );
  }

  override async createAll(models: M[], ...args: any[]): Promise<M[]> {
    if (!models.length) return models;
    const prepared = models.map((m) => this.adapter.prepare(m, this.pk));
    const ids = prepared.map((p) => p.id);
    let records = prepared.map((p) => p.record);
    const transients = prepared.map((p) => p.transient).filter((e) => !!e);
    let c: FabricContractContext | undefined = undefined;
    if (args.length) c = args[args.length - 1] as FabricContractContext;
    records = await this.adapter.createAll(
      this.tableName,
      ids,
      records,
      transients,
      ...args
    );
    return records.map((r, i) =>
      this.adapter.revert(
        r,
        this.class,
        this.pk,
        ids[i] as string | number,
        c && c.get("rebuildWithTransient") ? transients : undefined
      )
    );
  }

  override async update(model: M, ...args: any[]): Promise<M> {
    // eslint-disable-next-line prefer-const
    let { record, id, transient } = this.adapter.prepare(model, this.pk);
    record = await this.adapter.update(
      this.tableName,
      id,
      record,
      transient || {},
      ...args
    );
    let c: FabricContractContext | undefined = undefined;
    if (args.length) c = args[args.length - 1] as FabricContractContext;
    return this.adapter.revert<M>(
      record,
      this.class,
      this.pk,
      id,
      c && c.get("rebuildWithTransient") ? transient : undefined
    );
  }

  override async updateAll(models: M[], ...args: any[]): Promise<M[]> {
    if (!models.length) return models;
    const records = models.map((m) => this.adapter.prepare(m, this.pk));
    const transients = records.map((p) => p.transient).filter((e) => !!e);
    let c: FabricContractContext | undefined = undefined;
    if (args.length) c = args[args.length - 1] as FabricContractContext;

    const updated = await this.adapter.updateAll(
      this.tableName,
      records.map((r) => r.id),
      records.map((r) => r.record),
      transients,
      ...args
    );
    return updated.map((u, i) =>
      this.adapter.revert(
        u,
        this.class,
        this.pk,
        records[i].id,
        c && c.get("rebuildWithTransient") ? transients : undefined
      )
    );
  }

  async raw(rawInput: MangoQuery, docsOnly: boolean, ...args: any[]) {
    return this.adapter.raw(rawInput, docsOnly, ...args);
  }

  override async updateObservers(
    table: string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ctx: FabricContractContext,
    ...args: any[]
  ): Promise<void> {
    if (!this.trackedEvents || this.trackedEvents.indexOf(event) !== -1)
      return await super.updateObservers(table, event, id, ctx, ...args);
  }
}
