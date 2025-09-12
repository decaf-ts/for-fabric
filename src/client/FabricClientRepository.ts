import { Adapter, Repository } from "@decaf-ts/core";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import {
  Context,
  OperationKeys,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import { FabricFlags } from "../shared";

/**
 * @description Repository implementation for Fabric client operations
 * @summary Extends the generic Repository to prepare context and arguments for CRUD operations executed via a Fabric client Adapter, wiring RepositoryFlags and Fabric-specific overrides.
 * @template M extends Model - The model type handled by this repository
 * @param {Adapter<any, MangoQuery, FabricFlags, Context<FabricFlags>>} [adapter] - Optional adapter instance used to execute operations
 * @param {Constructor<M>} [clazz] - Optional model constructor used by the repository
 * @return {void}
 * @class FabricClientRepository
 * @example
 * import { Repository } from "@decaf-ts/core";
 * import { FabricClientRepository } from "@decaf-ts/for-fabric";
 *
 * class User extends Model { id!: string; name!: string; }
 * const repo = new FabricClientRepository<User>();
 * const created = await repo.create(new User({ id: "1", name: "Alice" }));
 * const loaded = await repo.read("1");
 *
 * @mermaid
 * sequenceDiagram
 *   participant App
 *   participant Repo as FabricClientRepository
 *   participant Adapter
 *   App->>Repo: create(model)
 *   Repo->>Repo: createPrefix(model, ...args)
 *   Repo->>Adapter: create(table, id, model, flags)
 *   Adapter-->>Repo: result
 *   Repo-->>App: model
 */
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

  /**
   * @description Prepare arguments and context for create
   * @summary Builds repository context and ensures the model is instantiated with the repository's class before delegating to the adapter
   * @param {M} model - The model instance to create
   * @param {...any[]} args - Additional operation arguments and flags
   * @return {...any[]} Tuple containing the prepared model and the processed arguments
   */
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

  /**
   * @description Prepare arguments and context for bulk create
   * @summary Resolves repository context for a createAll operation passing through models and processed arguments
   * @param {M[]} models - Array of model instances to create
   * @param {...any} args - Additional operation arguments and flags
   * @return {...any[]} Tuple containing the models array and processed arguments
   */
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

  /**
   * @description Prepare arguments and context for read
   * @summary Resolves repository context for a read operation and forwards the key and processed arguments
   * @param {string} key - The model primary key to read
   * @param {...any} args - Additional operation arguments and flags
   * @return {...any[]} Tuple containing the key and processed arguments
   */
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

  /**
   * @description Prepare arguments and context for bulk read
   * @summary Resolves repository context for a readAll operation and forwards the keys and processed arguments
   * @param {(string[]|number[])} keys - Array of model primary keys to read
   * @param {...any} args - Additional operation arguments and flags
   * @return {...any[]} Tuple containing the keys and processed arguments
   */
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

  /**
   * @description Prepare arguments and context for update
   * @summary Resolves repository context for an update operation and forwards the model and processed arguments
   * @param {M} model - The model instance to update
   * @param {...any[]} args - Additional operation arguments and flags
   * @return {...any[]} Tuple containing the model and processed arguments
   */
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

  /**
   * @description Prepare arguments and context for bulk update
   * @summary Resolves repository context for an updateAll operation and forwards the models and processed arguments
   * @param {M[]} models - The model instances to update
   * @param {...any} args - Additional operation arguments and flags
   * @return {...any[]} Tuple containing the models and processed arguments
   */
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

  /**
   * @description Prepare arguments and context for delete
   * @summary Resolves repository context for a delete operation, ensures the target exists via read, then forwards key and processed arguments
   * @param {string|number} key - The model primary key to delete
   * @param {...any} args - Additional operation arguments and flags
   * @return {...any[]} Tuple containing the key and processed arguments
   */
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

  /**
   * @description Prepare arguments and context for bulk delete
   * @summary Resolves repository context for a deleteAll operation, validates existence via readAll, then forwards keys and processed arguments
   * @param {(string[]|number[])} keys - The model primary keys to delete
   * @param {...any} args - Additional operation arguments and flags
   * @return {...any[]} Tuple containing the keys and processed arguments
   */
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
