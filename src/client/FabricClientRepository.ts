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
