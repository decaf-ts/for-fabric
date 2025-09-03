import { Adapter, Repository } from "@decaf-ts/core";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import {
  Context,
  InternalError,
  OperationKeys,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import { FabricFlags } from "../shared";

export class FabricClientRepository<M extends Model> extends Repository<
  M,
  MangoQuery,
  Adapter<any, MangoQuery, FabricFlags, Context<FabricFlags>>
> {
  constructor(
    adapter?: Adapter<any, MangoQuery, FabricFlags, Context<FabricFlags>>,
    clazz?: Constructor<M>
  ) {
    super(adapter, clazz);
  }

  protected override async createPrefix(
    model: M,
    ...args: any[]
  ): Promise<[M, ...any[]]> {
    const contextArgs = await Context.args<
      M,
      Context<RepositoryFlags>,
      RepositoryFlags
    >(
      OperationKeys.CREATE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    model = new this.class(model);
    return [model, ...contextArgs.args];
  }

  protected override async createAllPrefix(models: M[], ...args: any[]) {
    const contextArgs = await Context.args(
      OperationKeys.CREATE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    return [models, ...contextArgs.args];
  }

  protected override async readPrefix(key: string, ...args: any[]) {
    const contextArgs = await Context.args(
      OperationKeys.READ,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    return [key, ...contextArgs.args];
  }

  protected override async readAllPrefix(
    keys: string[] | number[],
    ...args: any[]
  ) {
    const contextArgs = await Context.args(
      OperationKeys.READ,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    return [keys, ...contextArgs.args];
  }

  protected override async updatePrefix(
    model: M,
    ...args: any[]
  ): Promise<[M, ...args: any[]]> {
    const contextArgs = await Context.args(
      OperationKeys.UPDATE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const pk = model[this.pk] as string;
    if (!pk)
      throw new InternalError(
        `No value for the Id is defined under the property ${this.pk as string}`
      );
    const oldModel = await this.read(pk, ...contextArgs.args);
    model = this.merge(oldModel, model);

    if (Repository.getMetadata(oldModel)) {
      if (!Repository.getMetadata(model))
        Repository.setMetadata(model, Repository.getMetadata(oldModel));
    }
    return [model, ...contextArgs.args];
  }

  protected override async updateAllPrefix(
    models: M[],
    ...args: any[]
  ): Promise<any[]> {
    const contextArgs = await Context.args(
      OperationKeys.UPDATE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const ids = models.map((m) => {
      const id = m[this.pk] as string;
      if (!id) throw new InternalError("missing id on update operation");
      return id;
    });
    const oldModels = await this.readAll(ids, ...contextArgs.args);
    models = models.map((m, i) => {
      m = this.merge(oldModels[i], m);
      if (Repository.getMetadata(oldModels[i])) {
        if (!Repository.getMetadata(m))
          Repository.setMetadata(m, Repository.getMetadata(oldModels[i]));
      }
      return m;
    });

    models.forEach((m, i) => {
      if (Repository.getMetadata(oldModels[i])) {
        if (!Repository.getMetadata(m))
          Repository.setMetadata(m, Repository.getMetadata(oldModels[i]));
      }
    });
    return [models, ...contextArgs.args];
  }

  protected override async deletePrefix(key: any, ...args: any[]) {
    const contextArgs = await Context.args(
      OperationKeys.DELETE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    await this.read(key, ...contextArgs.args);
    return [key, ...contextArgs.args];
  }

  protected override async deleteAllPrefix(
    keys: string[] | number[],
    ...args: any[]
  ) {
    const contextArgs = await Context.args(
      OperationKeys.DELETE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    await this.readAll(keys, ...contextArgs.args);
    return [keys, ...contextArgs.args];
  }
}
