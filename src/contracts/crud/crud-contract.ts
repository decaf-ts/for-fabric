import { FabricContractAdapter } from "../ContractAdapter";

import { Contract, Context as Ctx } from "fabric-contract-api";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { Repository } from "@decaf-ts/core";
import { FabricContractRepository } from "../FabricContractRepository";

/**
 * @description Base contract class for CRUD operations in Fabric chaincode
 * @summary Provides standard create, read, update, and delete operations for models in Fabric chaincode
 * @template M - Type extending Model
 * @class FabricCrudContract
 * @extends {Contract}
 * @example
 * ```typescript
 * // Define a model
 * @table('assets')
 * class Asset extends Model {
 *   @id()
 *   id: string;
 *
 *   @property()
 *   data: string;
 * }
 *
 * // Create a contract that extends FabricCrudContract
 * export class AssetContract extends FabricCrudContract<Asset> {
 *   constructor() {
 *     super('AssetContract', Asset);
 *   }
 *
 *   // Add custom methods as needed
 *   async getAssetHistory(ctx: Context, id: string): Promise<any[]> {
 *     // Custom implementation
 *   }
 * }
 * ```
 * @mermaid
 * sequenceDiagram
 *   participant Client
 *   participant Contract
 *   participant Repository
 *   participant Adapter
 *   participant StateDB
 *
 *   Client->>Contract: create(ctx, model)
 *   Contract->>Repository: repository(ctx)
 *   Contract->>Repository: create(model, ctx)
 *   Repository->>Adapter: create(tableName, id, record, transient, ctx)
 *   Adapter->>StateDB: putState(id, serializedData)
 *   StateDB-->>Adapter: Success
 *   Adapter-->>Repository: record
 *   Repository-->>Contract: model
 *   Contract-->>Client: model
 */
export abstract class FabricCrudContract<M extends Model> extends Contract {
  /**
   * @description Shared adapter instance for all contract instances
   */
  protected static adapter: FabricContractAdapter;

  /**
   * @description Creates a new FabricCrudContract instance
   * @summary Initializes a contract with a name and model class
   * @param {string} name - The name of the contract
   * @param {Constructor<M>} clazz - The model constructor
   */
  protected constructor(
    name: string,
    private clazz: Constructor<M>
  ) {
    super(name);
    FabricCrudContract.adapter =
      FabricCrudContract.adapter || new FabricContractAdapter(undefined, name);
  }

  /**
   * @description Gets a repository for the model
   * @summary Creates a repository instance for the model class with the current context
   * @param {Ctx} ctx - The Fabric chaincode context
   * @return {FabricContractRepository<M>} The repository instance
   */
  protected repository(ctx: Ctx): FabricContractRepository<M> {
    return Repository.forModel(
      this.clazz,
      FabricCrudContract.adapter.alias,
      ctx
    );
  }

  /**
   * @description Creates a single model in the state database
   * @summary Delegates to the repository's create method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {M} model - The model to create
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M>} Promise resolving to the created model
   */
  async create(ctx: Ctx, model: M, ...args: any[]): Promise<M> {
    const repo = this.repository(ctx);
    return repo.create(model, ...args);
  }

  /**
   * @description Creates multiple models in the state database
   * @summary Delegates to the repository's createAll method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {M[]} models - The models to create
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M[]>} Promise resolving to the created models
   */
  async createAll(ctx: Ctx, models: M[], ...args: any[]): Promise<M[]> {
    const repo = this.repository(ctx);
    return repo.createAll(models, ...args);
  }

  /**
   * @description Deletes a single model from the state database
   * @summary Delegates to the repository's delete method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {string | number} key - The key of the model to delete
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M>} Promise resolving to the deleted model
   */
  async delete(ctx: Ctx, key: string | number, ...args: any[]): Promise<M> {
    const repo = this.repository(ctx);
    return repo.delete(key, ...args);
  }

  /**
   * @description Deletes multiple models from the state database
   * @summary Delegates to the repository's deleteAll method
   * @param {string[] | number[]} keys - The keys of the models to delete
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M[]>} Promise resolving to the deleted models
   */
  async deleteAll(
    keys: string[] | number[],
    ctx: Ctx,
    ...args: any[]
  ): Promise<M[]> {
    const repo = this.repository(ctx);
    return repo.deleteAll(keys, ...args);
  }

  /**
   * @description Reads a single model from the state database
   * @summary Delegates to the repository's read method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {string | number} key - The key of the model to read
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M>} Promise resolving to the retrieved model
   */
  async read(ctx: Ctx, key: string | number, ...args: any[]): Promise<M> {
    const repo = this.repository(ctx);
    return repo.read(key, ...args);
  }

  /**
   * @description Reads multiple models from the state database
   * @summary Delegates to the repository's readAll method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {string[] | number[]} keys - The keys of the models to read
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M[]>} Promise resolving to the retrieved models
   */
  async readAll(
    ctx: Ctx,
    keys: string[] | number[],
    ...args: any[]
  ): Promise<M[]> {
    const repo = this.repository(ctx);
    return repo.readAll(keys, ...args);
  }

  /**
   * @description Updates a single model in the state database
   * @summary Delegates to the repository's update method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {M} model - The model to update
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M>} Promise resolving to the updated model
   */
  async update(ctx: Ctx, model: M, ...args: any[]): Promise<M> {
    const repo = this.repository(ctx);
    return repo.update(model, ctx, ...args);
  }

  /**
   * @description Updates multiple models in the state database
   * @summary Delegates to the repository's updateAll method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {M[]} models - The models to update
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M[]>} Promise resolving to the updated models
   */
  async updateAll(ctx: Ctx, models: M[], ...args: any[]): Promise<M[]> {
    const repo = this.repository(ctx);
    return repo.updateAll(models, ...args);
  }

  /**
   * @description Executes a raw query against the state database
   * @summary Delegates to the repository's raw method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {any} rawInput - The query to execute
   * @param {boolean} docsOnly - Whether to return only documents
   * @param {...any[]} args - Additional arguments
   * @return {Promise<any>} Promise resolving to the query results
   */
  async raw(
    ctx: Ctx,
    rawInput: any,
    docsOnly: boolean,
    ...args: any[]
  ): Promise<any> {
    const repo = this.repository(ctx);
    return repo.raw(rawInput, docsOnly, ...args);
  }
}
