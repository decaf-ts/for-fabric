import { FabricContractAdapter } from "../ContractAdapter";
import { Context, Contract, Context as Ctx } from "fabric-contract-api";
import { Constructor, Model, Serializer } from "@decaf-ts/decorator-validation";
import { Repository } from "@decaf-ts/core";
import { FabricContractRepository } from "../FabricContractRepository";
import { DeterministicSerializer } from "../../shared/DeterministicSerializer";
import { MangoQuery } from "@decaf-ts/for-couchdb";
import { Checkable, healthcheck } from "../../shared/interfaces/Checkable";
import { ContractLogger } from "../logging";
import { Logging } from "@decaf-ts/logging";
import { isModelPrivate, modelToPrivate } from "../private-data";
import { FabricContractPrivateDataAdapter } from "../ContractPrivateDataAdapter";

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
export abstract class FabricCrudContract<M extends Model>
  extends Contract
  implements Checkable
{
  /**
   * @description Shared adapter instance for all contract instances
   */
  protected static adapter: FabricContractAdapter;

  protected readonly repo: FabricContractRepository<M>;

  protected static readonly serializer = new DeterministicSerializer();

  protected initialized: boolean = false;

  /**
   * @description Creates a new FabricCrudContract instance
   * @summary Initializes a contract with a name and model class
   * @param {string} name - The name of the contract
   * @param {Constructor<M>} clazz - The model constructor
   */
  protected constructor(
    name: string,
    protected readonly clazz: Constructor<M>
  ) {
    super(name);
    FabricCrudContract.adapter = this.getAdapter(clazz);
    this.repo = Repository.forModel(clazz, FabricCrudContract.adapter.alias);
  }

  protected getAdapter(clazz: Constructor<M>): FabricContractAdapter {
    const instance = new clazz();

    if (isModelPrivate(instance)) {
      const pvt = modelToPrivate(instance);
      const collections = Object.keys(pvt.private!);

      return new FabricContractPrivateDataAdapter(
        undefined,
        "fabric-private-data-adapter",
        collections
      );
    } else {
      return new FabricContractAdapter(undefined, "fabric-public-data-adapter");
    }
  }

  /**
   * @description Creates a logger for a specific chaincode context
   * @summary Returns a ContractLogger instance configured for the current context
   * @param {Ctx} ctx - The Fabric chaincode context
   * @return {ContractLogger} The logger instance
   */
  public logFor(ctx: Context): ContractLogger {
    return Logging.for(FabricCrudContract.name, {}, ctx) as ContractLogger;
  }

  /**
   * @description Creates a single model in the state database
   * @summary Delegates to the repository's create method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {M} model - The model to create
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M>} Promise resolving to the created model
   */
  async create(
    ctx: Ctx,
    model: string | M,
    ...args: any[]
  ): Promise<string | M> {
    const log = this.logFor(ctx).for(this.create);

    if (typeof model === "string") model = this.deserialize<M>(model) as any;

    log.info(`Creating model: ${JSON.stringify(model)}`);

    const transient = this.getTransientData(ctx);

    log.info(`Merging transient data...`);
    model = (this.repo as any).merge(model as M, transient);

    return this.repo.create(model as unknown as M, ctx, ...args);
  }

  /**
   * @description Reads a single model from the state database
   * @summary Delegates to the repository's read method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {string | number} key - The key of the model to read
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M>} Promise resolving to the retrieved model
   */
  async read(
    ctx: Ctx,
    key: string | number,
    ...args: any[]
  ): Promise<M | string> {
    const log = this.logFor(ctx).for(this.read);

    log.info(`reading entry with pk ${key} `);

    return this.repo.read(key, ctx, ...args);
  }

  protected getTransientData(ctx: Ctx): any {
    const transientMap = ctx.stub.getTransient();
    let transient: any = {};

    if (transientMap.has((this.repo as any).tableName)) {
      transient = JSON.parse(
        (transientMap.get((this.repo as any).tableName) as Buffer)?.toString(
          "utf8"
        ) as string
      );
    }

    return transient;
  }

  /**
   * @description Updates a single model in the state database
   * @summary Delegates to the repository's update method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {M} model - The model to update
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M>} Promise resolving to the updated model
   */
  async update(
    ctx: Ctx,
    model: string | M,
    ...args: any[]
  ): Promise<string | M> {
    const log = this.logFor(ctx).for(this.update);

    if (typeof model === "string") model = this.deserialize<M>(model) as any;

    log.info(`Updating model: ${JSON.stringify(model)}`);

    const transient = this.getTransientData(ctx);

    log.info(`Merging transient data...`);
    model = (this.repo as any).merge(model as M, transient);

    return this.repo.update(model as unknown as M, ctx, ...args);
  }

  /**
   * @description Deletes a single model from the state database
   * @summary Delegates to the repository's delete method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {string | number} key - The key of the model to delete
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M>} Promise resolving to the deleted model
   */
  async delete(
    ctx: Ctx,
    key: string | number,
    ...args: any[]
  ): Promise<M | string> {
    const log = this.logFor(ctx).for(this.delete);
    log.info(`deleting entry with pk ${key} `);
    return this.repo.delete(String(key), ctx, ...args);
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
    ctx: Ctx,
    keys: string | string[] | number[],
    ...args: any[]
  ): Promise<M[] | string> {
    if (typeof keys === "string") keys = JSON.parse(keys) as string[];
    return this.repo.deleteAll(keys, ctx, ...args);
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
    keys: string | string[] | number[],
    ...args: any[]
  ): Promise<M[] | string> {
    if (typeof keys === "string") keys = JSON.parse(keys) as string[];
    return this.repo.readAll(keys, ctx, ...args);
  }

  /**
   * @description Updates multiple models in the state database
   * @summary Delegates to the repository's updateAll method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {M[]} models - The models to update
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M[]>} Promise resolving to the updated models
   */
  async updateAll(
    ctx: Ctx,
    models: string | M[],
    ...args: any[]
  ): Promise<string | M[]> {
    const log = this.logFor(ctx).for(this.updateAll);
    if (typeof models === "string")
      models = (JSON.parse(models) as [])
        .map((m) => this.deserialize(m))
        .map((m) => new this.clazz(m)) as any;

    log.info(`updating ${models.length} entries to the table`);
    return this.repo.updateAll(models as unknown as M[], ctx, ...args);
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
    rawInput: MangoQuery | string,
    docsOnly: boolean,
    ...args: any[]
  ): Promise<any | string> {
    if (typeof rawInput === "string")
      rawInput = JSON.parse(rawInput) as MangoQuery;
    return this.repo.raw(rawInput, docsOnly, ctx, ...args);
  }

  protected serialize(model: M): string {
    return FabricCrudContract.serializer.serialize(model);
  }

  protected deserialize<M extends Model>(str: string): M {
    return (
      FabricCrudContract.serializer as unknown as Serializer<M>
    ).deserialize(str);
  }

  protected async init(ctx: Ctx): Promise<void> {
    const log = this.logFor(ctx).for(this.init);
    log.info(`Running contract initialization...`);
    this.initialized = true;
    log.info(`Contract initialization completed.`);
  }

  async healthcheck(ctx: Ctx): Promise<string | healthcheck> {
    const log = this.logFor(ctx).for(this.healthcheck);
    log.info(`Running Healthcheck: ${this.initialized}...`);
    return { healthcheck: this.initialized };
  }

  /**
   * @description Creates multiple models in the state database
   * @summary Delegates to the repository's createAll method
   * @param {Ctx} ctx - The Fabric chaincode context
   * @param {M[]} models - The models to create
   * @param {...any[]} args - Additional arguments
   * @return {Promise<M[]>} Promise resolving to the created models
   */
  async createAll(
    ctx: Ctx,
    models: string | M[],
    ...args: any[]
  ): Promise<string | M[]> {
    const log = this.logFor(ctx).for(this.createAll);

    if (typeof models === "string")
      models = (JSON.parse(models) as [])
        .map((m) => this.deserialize(m))
        .map((m) => new this.clazz(m)) as any;

    log.info(`adding ${models.length} entries to the table`);
    return this.repo.createAll(models as unknown as M[], ctx, ...args);
  }
}
