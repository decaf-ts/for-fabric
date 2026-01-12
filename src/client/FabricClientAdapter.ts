import "../shared/overrides";
import { CouchDBKeys, type MangoQuery } from "@decaf-ts/for-couchdb";
import { Client } from "@grpc/grpc-js";
import * as grpc from "@grpc/grpc-js";
import {
  Model,
  type ModelConstructor,
  type Serializer,
} from "@decaf-ts/decorator-validation";
import { debug, final, Logging } from "@decaf-ts/logging";
import { type PeerConfig, type SegregatedModel } from "../shared/types";
import {
  connect,
  type ConnectOptions,
  Gateway,
  Network,
  ProposalOptions,
  Contract as Contrakt,
  type Signer,
} from "@hyperledger/fabric-gateway";
import { getIdentity, getSigner } from "./fabric-fs";
import {
  BaseError,
  InternalError,
  OperationKeys,
  SerializationError,
  BulkCrudOperationKeys,
  NotFoundError,
  ConflictError,
  BadRequestError,
  type PrimaryKeyType,
} from "@decaf-ts/db-decorators";
import {
  Context,
  Adapter,
  type AdapterFlags,
  AuthorizationError,
  ConnectionError,
  ForbiddenError,
  MigrationError,
  ObserverError,
  PagingError,
  PersistenceKeys,
  QueryError,
  Repository,
  UnsupportedError,
  Statement,
  type PreparedStatement,
  Paginator,
  MaybeContextualArg,
  ContextualArgs,
  type PreparedModel,
} from "@decaf-ts/core";
import { FabricFlavour } from "../shared/constants";
import { ClientSerializer } from "../shared/ClientSerializer";
import { FabricClientDispatch } from "./FabricClientDispatch";
import { HSMSignerFactoryCustom } from "./fabric-hsm";
import { type Constructor } from "@decaf-ts/decoration";
import { FabricClientStatement } from "./FabricClientStatement";
import { FabricClientPaginator } from "./FabricClientPaginator";
import { FabricClientRepository } from "./FabricClientRepository";
import {
  EndorsementError,
  EndorsementPolicyError,
  MvccReadConflictError,
  PhantomReadConflictError,
} from "../shared/errors";
import { FabricClientFlags } from "./types";
import { DefaultFabricClientFlags } from "./constants";
import fs from "fs";
/**
 * @description Adapter for interacting with Hyperledger Fabric networks
 * @summary The FabricAdapter extends CouchDBAdapter to provide a seamless interface for interacting with Hyperledger Fabric networks.
 * It handles connection management, transaction submission, and CRUD operations against Fabric chaincode.
 * @template PeerConfig - Configuration type for connecting to a Fabric peer
 * @template FabricFlags - Flags specific to Fabric operations
 * @template Context<FabricFlags> - Context type containing Fabric-specific flags
 * @param config - Configuration for connecting to a Fabric peer
 * @param alias - Optional alias for the adapter instance
 * @class FabricClientAdapter
 * @example
 * ```typescript
 * // Create a new FabricAdapter instance
 * const config: PeerConfig = {
 *   mspId: 'Org1MSP',
 *   peerEndpoint: 'localhost:7051',
 *   channelName: 'mychannel',
 *   chaincodeName: 'mycc',
 *   contractName: 'mycontract',
 *   tlsCertPath: '/path/to/tls/cert',
 *   certDirectoryPath: '/path/to/cert/dir',
 *   keyDirectoryPath: '/path/to/key/dir'
 * };
 *
 * const adapter = new FabricAdapter(config, 'org1-adapter');
 *
 * // Use the adapter to interact with the Fabric network
 * const result = await adapter.read('users', 'user1', mySerializer);
 * ```
 * @mermaid
 * sequenceDiagram
 *   participant Client
 *   participant FabricAdapter
 *   participant Gateway
 *   participant Network
 *   participant Contract
 *   participant Chaincode
 *
 *   Client->>FabricAdapter: create(tableName, id, model, transient, serializer)
 *   FabricAdapter->>FabricAdapter: submitTransaction(OperationKeys.CREATE, [serializedModel], transient)
 *   FabricAdapter->>Gateway: connect()
 *   Gateway->>Network: getNetwork(channelName)
 *   Network->>Contract: getContract(chaincodeName, contractName)
 *   FabricAdapter->>Contract: submit(api, proposalOptions)
 *   Contract->>Chaincode: invoke
 *   Chaincode-->>Contract: response
 *   Contract-->>FabricAdapter: result
 *   FabricAdapter->>FabricAdapter: decode(result)
 *   FabricAdapter->>FabricAdapter: serializer.deserialize(decodedResult)
 *   FabricAdapter-->>Client: deserializedResult
 */
export class FabricClientAdapter extends Adapter<
  PeerConfig,
  Client,
  MangoQuery,
  Context<FabricClientFlags>
> {
  /**
   * @description Static text decoder for converting Uint8Array to string
   */
  private static decoder = new TextDecoder("utf8");

  private static serializer = new ClientSerializer();

  protected static log = Logging.for(FabricClientAdapter);

  protected readonly serializer: Serializer<any> =
    FabricClientAdapter.serializer;

  /**
   * @description Creates a new FabricAdapter instance
   * @summary Initializes a new adapter for interacting with a Hyperledger Fabric network
   * @param {PeerConfig} config - Configuration for connecting to a Fabric peer
   * @param {string} [alias] - Optional alias for the adapter instance
   */
  constructor(config: PeerConfig, alias?: string) {
    super(config, FabricFlavour, alias);
  }

  override Statement<M extends Model>(
    overrides?: Partial<AdapterFlags>
  ): Statement<M, FabricClientAdapter, any, MangoQuery> {
    return new FabricClientStatement(this, overrides);
  }

  Paginator<M extends Model>(
    query: PreparedStatement<any> | MangoQuery,
    size: number,
    clazz: Constructor<M>
  ): Paginator<M, any, MangoQuery> {
    return new FabricClientPaginator(this, query, size, clazz);
  }

  override async context<M extends Model>(
    operation:
      | OperationKeys.CREATE
      | OperationKeys.READ
      | OperationKeys.UPDATE
      | OperationKeys.DELETE
      | string,
    overrides: Partial<FabricClientFlags>,
    model: Constructor<M> | Constructor<M>[],
    ...args: any[]
  ): Promise<Context<FabricClientFlags>> {
    const log = this.log.for(this.context);
    log.debug(
      `Creating new context for ${operation} operation on ${Array.isArray(model) ? model.map((m) => m.name) : model.name} model with flag overrides: ${JSON.stringify(overrides)}`
    );
    const flags = await this.flags(
      operation,
      model,
      Object.assign({}, DefaultFabricClientFlags, overrides),
      ...args
    );
    return new Context().accumulate(flags);
  }

  /**
   * @description Decodes a Uint8Array to a string
   * @summary Converts binary data received from Fabric to a string using UTF-8 encoding
   * @param {Uint8Array} data - The binary data to decode
   * @return {string} The decoded string
   */
  decode(data: Uint8Array): string {
    return FabricClientAdapter.decoder.decode(data);
  }

  override repository<
    R extends Repository<
      any,
      Adapter<PeerConfig, Client, MangoQuery, Context<FabricClientFlags>>
    >,
  >(): Constructor<R> {
    return FabricClientRepository as unknown as Constructor<R>;
  }

  protected createPrefix<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    model: Record<string, any>,
    ...args: MaybeContextualArg<Context<FabricClientFlags>>
  ): [Constructor<M>, PrimaryKeyType, Record<string, any>, ...any[], Context] {
    const { ctxArgs } = this.logCtx(args, this.createPrefix);
    const tableName = Model.tableName(clazz);
    const record: Record<string, any> = {};
    record[CouchDBKeys.TABLE] = tableName;
    Object.assign(record, model);
    return [clazz, id, record, ...ctxArgs];
  }

  /**
   * @description Prepares multiple records for creation
   * @summary Adds necessary CouchDB fields to multiple records before creation
   * @param {string} tableName - The name of the table
   * @param {string[]|number[]} ids - The IDs of the records
   * @param models - The models to prepare
   * @return A tuple containing the tableName, ids, and prepared records
   * @throws {InternalError} If ids and models arrays have different lengths
   */
  protected createAllPrefix<M extends Model>(
    clazz: Constructor<M>,
    ids: string[] | number[],
    models: Record<string, any>[],
    ...args: MaybeContextualArg<Context<FabricClientFlags>>
  ) {
    const tableName = Model.tableName(clazz);
    if (ids.length !== models.length)
      throw new InternalError("Ids and models must have the same length");
    const { ctxArgs } = this.logCtx(args, this.createAllPrefix);
    const records = ids.map((id, count) => {
      const record: Record<string, any> = {};
      record[CouchDBKeys.TABLE] = tableName;
      Object.assign(record, models[count]);
      return record;
    });
    return [clazz, ids, records, ...ctxArgs];
  }

  protected updateAllPrefix<M extends Model>(
    clazz: Constructor<M>,
    ids: PrimaryKeyType[],
    models: Record<string, any>[],
    ...args: MaybeContextualArg<Context<FabricClientFlags>>
  ) {
    const tableName = Model.tableName(clazz);
    if (ids.length !== models.length)
      throw new InternalError("Ids and models must have the same length");
    const { ctxArgs } = this.logCtx(args, this.updateAllPrefix);
    const records = ids.map(() => {
      const record: Record<string, any> = {};
      record[CouchDBKeys.TABLE] = tableName;
      return record;
    });
    return [clazz, ids, records, ...ctxArgs];
  }

  /**
   * @description Creates multiple records in a single transaction
   * @summary Submits a transaction to create multiple records in the Fabric ledger
   * @param {string} tableName - The name of the table/collection
   * @param {string[] | number[]} ids - Array of record identifiers
   * @param {Array<Record<string, any>>} models - Array of record data
   * @param {Record<string, any>} transient - Transient data for the transaction
   * @return {Promise<Array<Record<string, any>>>} Promise resolving to the created records
   */
  override async createAll<M extends Model>(
    clazz: Constructor<M>,
    ids: PrimaryKeyType[],
    models: Record<string, any>[],
    ...args: ContextualArgs<Context<FabricClientFlags>>
  ): Promise<Record<string, any>[]> {
    if (ids.length !== models.length)
      throw new InternalError("Ids and models must have the same length");
    //HERE!
    const ctxArgs = [...(args as unknown as any[])];
    const transient = ctxArgs.shift() as Record<string, any>;
    const { log, ctx } = this.logCtx(
      ctxArgs as ContextualArgs<Context<FabricClientFlags>>,
      this.createAll
    );
    const tableName = Model.tableName(clazz);

    log.info(`adding ${ids.length} entries to ${tableName} table`);
    log.verbose(`pks: ${ids}`);
    const result = await this.submitTransaction(
      ctx,
      BulkCrudOperationKeys.CREATE_ALL,
      [
        JSON.stringify(
          models.map((m) => this.serializer.serialize(m, clazz.name))
        ),
      ],
      transient,
      undefined,
      clazz.name
    );
    try {
      return JSON.parse(this.decode(result)).map((r: any) => JSON.parse(r));
    } catch (e: unknown) {
      throw new SerializationError(e as Error);
    }
  }

  /**
   * @description Reads multiple records in a single transaction
   * @summary Submits a transaction to read multiple records from the Fabric ledger
   * @param {string} tableName - The name of the table/collection
   * @param {string[] | number[]} ids - Array of record identifiers to read
   * @return {Promise<Array<Record<string, any>>>} Promise resolving to the retrieved records
   */
  override async readAll<M extends Model>(
    clazz: Constructor<M>,
    ids: PrimaryKeyType[],
    ...args: ContextualArgs<Context<FabricClientFlags>>
  ): Promise<Record<string, any>[]> {
    const { log, ctx } = this.logCtx(args, this.readAll);
    const tableName = Model.tableName(clazz);
    log.info(`reading ${ids.length} entries to ${tableName} table`);
    log.verbose(`pks: ${ids}`);
    const result = await this.evaluateTransaction(
      ctx,
      BulkCrudOperationKeys.READ_ALL,
      [JSON.stringify(ids)],
      undefined,
      undefined,
      clazz.name
    );
    try {
      return JSON.parse(this.decode(result)).map((r: any) => JSON.parse(r));
    } catch (e: unknown) {
      throw new SerializationError(e as Error);
    }
  }

  /**
   * @description Updates multiple records in a single transaction
   * @summary Submits a transaction to update multiple records in the Fabric ledger
   * @param {string} tableName - The name of the table/collection
   * @param {string[] | number[]} ids - Array of record identifiers
   * @param {Array<Record<string, any>>} models - Array of updated record data
   * @param {Record<string, any>} transient - Transient data for the transaction
   * @return {Promise<Array<Record<string, any>>>} Promise resolving to the updated records
   */
  override async updateAll<M extends Model>(
    clazz: Constructor<M>,
    ids: PrimaryKeyType[],
    models: Record<string, any>[],
    ...args: ContextualArgs<Context<FabricClientFlags>>
  ): Promise<Record<string, any>[]> {
    if (ids.length !== models.length)
      throw new InternalError("Ids and models must have the same length");
    const ctxArgs = [...(args as unknown as any[])];
    const transient = ctxArgs.shift() as Record<string, any>;
    const { log, ctx } = this.logCtx(
      ctxArgs as ContextualArgs<Context<FabricClientFlags>>,
      this.updateAll
    );
    const tableName = Model.tableName(clazz);
    log.info(`updating ${ids.length} entries to ${tableName} table`);
    log.verbose(`pks: ${ids}`);

    const result = await this.submitTransaction(
      ctx,
      BulkCrudOperationKeys.UPDATE_ALL,
      [
        JSON.stringify(
          models.map((m) => this.serializer.serialize(m, clazz.name))
        ),
      ],
      transient,
      undefined,
      clazz.name
    );
    try {
      return JSON.parse(this.decode(result)).map((r: any) => JSON.parse(r));
    } catch (e: unknown) {
      throw new SerializationError(e as Error);
    }
  }

  /**
   * @description Deletes multiple records in a single transaction
   * @summary Submits a transaction to delete multiple records from the Fabric ledger
   * @param {string} tableName - The name of the table/collection
   * @param {Array<string | number | bigint>} ids - Array of record identifiers to delete
   * @param {Serializer<any>} serializer - Serializer for the model data
   * @return {Promise<Array<Record<string, any>>>} Promise resolving to the deleted records
   */
  override async deleteAll<M extends Model>(
    clazz: Constructor<M>,
    ids: PrimaryKeyType[],
    ...args: ContextualArgs<Context<FabricClientFlags>>
  ): Promise<Record<string, any>[]> {
    const { log, ctx } = this.logCtx(args, this.deleteAll);
    const tableName = Model.tableName(clazz);
    log.info(`deleting ${ids.length} entries to ${tableName} table`);
    log.verbose(`pks: ${ids}`);
    const result = await this.submitTransaction(
      ctx,
      BulkCrudOperationKeys.DELETE_ALL,
      [JSON.stringify(ids)],
      undefined,
      undefined,
      clazz.name
    );
    try {
      return JSON.parse(this.decode(result)).map((r: any) => JSON.parse(r));
    } catch (e: unknown) {
      throw new SerializationError(e as Error);
    }
  }

  /**
   * @description Prepares a model for persistence
   * @summary Converts a model instance into a format suitable for database storage,
   * handling column mapping and separating transient properties
   * @template M - The model type
   * @param {M} model - The model instance to prepare
   * @param pk - The primary key property name
   * @return The prepared data
   */
  override prepare<M extends Model>(
    model: M,
    ...args: ContextualArgs<Context<FabricClientFlags>>
  ): SegregatedModel<M> & PreparedModel {
    const { log } = this.logCtx(args, this.prepare);
    const split = Model.segregate(model);
    if ((model as any)[PersistenceKeys.METADATA]) {
      log.silly(
        `Passing along persistence metadata for ${(model as any)[PersistenceKeys.METADATA]}`
      );
      Object.defineProperty(split.model, PersistenceKeys.METADATA, {
        enumerable: false,
        writable: false,
        configurable: true,
        value: (model as any)[PersistenceKeys.METADATA],
      });
    }

    return {
      record: split.model,
      model: split.model,
      id: model[Model.pk(model.constructor as Constructor<M>)] as string,
      transient: split.transient,
      private: split.private,
      shared: split.shared,
    };
  }

  override revert<M extends Model>(
    obj: Record<string, any>,
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    transient?: Record<string, any>,
    ...args: ContextualArgs<Context<FabricClientFlags>>
  ): M {
    const { log } = this.logCtx(args, this.revert);
    if (transient) {
      log.verbose(
        `re-adding transient properties: ${Object.keys(transient).join(", ")}`
      );
      Object.entries(transient as Record<string, any>).forEach(([key, val]) => {
        if (key in obj)
          throw new InternalError(
            `Transient property ${key} already exists on model ${typeof clazz === "string" ? clazz : clazz.name}. should be impossible`
          );
        (obj as M)[key as keyof M] = val;
      });
    }

    return new (clazz as Constructor<M>)(obj);
  }

  /**
   * @description Creates a single record
   * @summary Submits a transaction to create a record in the Fabric ledger
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The record identifier
   * @param {Record<string, any>} model - The record data
   * @param {Record<string, any>} transient - Transient data for the transaction
   * @return {Promise<Record<string, any>>} Promise resolving to the created record
   */
  @debug()
  @final()
  override async create<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    model: Record<string, any>,
    transient: Record<string, any> = {},
    ...args: ContextualArgs<Context<FabricClientFlags>>
  ): Promise<Record<string, any>> {
    const ctxArgs = [...(args as unknown as any[])];
    const { log, ctx } = this.logCtx(
      ctxArgs as ContextualArgs<Context<FabricClientFlags>>,
      this.create
    );
    const tableName = Model.tableName(clazz);
    log.verbose(`adding entry to ${tableName} table`);
    log.debug(`pk: ${id}`);
    const result = await this.submitTransaction(
      ctx,
      OperationKeys.CREATE,
      [this.serializer.serialize(model, clazz.name)],
      transient,
      undefined,
      clazz.name
    );
    return this.serializer.deserialize(this.decode(result));
  }

  /**
   * @description Reads a single record
   * @summary Evaluates a transaction to read a record from the Fabric ledger
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The record identifier
   * @return {Promise<Record<string, any>>} Promise resolving to the retrieved record
   */
  @debug()
  @final()
  async read<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    ...args: ContextualArgs<Context<FabricClientFlags>>
  ): Promise<Record<string, any>> {
    const { log, ctx } = this.logCtx(args, this.readAll);
    const tableName = Model.tableName(clazz);

    log.verbose(`reading entry from ${tableName} table`);
    log.debug(`pk: ${id}`);
    const result = await this.evaluateTransaction(
      ctx,
      OperationKeys.READ,
      [id.toString()],
      undefined,
      undefined,
      clazz.name
    );
    return this.serializer.deserialize(this.decode(result));
  }

  updatePrefix<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    model: Record<string, any>,
    ...args: MaybeContextualArg<Context<FabricClientFlags>>
  ) {
    const tableName = Model.tableName(clazz);
    const { ctxArgs } = this.logCtx(args, this.updatePrefix);
    const record: Record<string, any> = {};
    record[CouchDBKeys.TABLE] = tableName;
    // record[CouchDBKeys.ID] = this.generateId(tableName, id);
    Object.assign(record, model);
    return [clazz, id, record, ...ctxArgs];
  }

  /**
   * @description Updates a single record
   * @summary Submits a transaction to update a record in the Fabric ledger
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The record identifier
   * @param {Record<string, any>} model - The updated record data
   * @param {Record<string, any>} transient - Transient data for the transaction
   * @return {Promise<Record<string, any>>} Promise resolving to the updated record
   */
  @debug()
  @final()
  async update<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    model: Record<string, any>,
    transient: Record<string, any> = {},
    ...args: ContextualArgs<Context<FabricClientFlags>>
  ): Promise<Record<string, any>> {
    const ctxArgs = [...(args as unknown as any[])];
    const { log, ctx } = this.logCtx(
      ctxArgs as ContextualArgs<Context<FabricClientFlags>>,
      this.updateAll
    );
    log.info(`CLIENT UPDATE class : ${typeof clazz}`);
    const tableName = Model.tableName(clazz);
    log.verbose(`updating entry to ${tableName} table`);
    log.debug(`pk: ${id}`);
    const result = await this.submitTransaction(
      ctx,
      OperationKeys.UPDATE,
      [this.serializer.serialize(model, clazz.name || clazz)], // TODO should be receving class but is receiving string
      transient,
      undefined,
      clazz.name
    );
    return this.serializer.deserialize(this.decode(result));
  }

  /**
   * @description Deletes a single record
   * @summary Submits a transaction to delete a record from the Fabric ledger
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The record identifier to delete
   * @return {Promise<Record<string, any>>} Promise resolving to the deleted record
   */
  @debug()
  @final()
  override async delete<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    ...args: ContextualArgs<Context<FabricClientFlags>>
  ): Promise<Record<string, any>> {
    const { log, ctx } = this.logCtx(args, this.delete);
    const tableName = Model.tableName(clazz);
    log.verbose(`deleting entry from ${tableName} table`);
    log.debug(`pk: ${id}`);
    const result = await this.submitTransaction(
      ctx,
      OperationKeys.DELETE,
      [id.toString()],
      undefined,
      undefined,
      clazz.name
    );
    return this.serializer.deserialize(this.decode(result));
  }

  /**
   * @description Executes a raw query against the Fabric ledger
   * @summary Evaluates a transaction to perform a query using Mango Query syntax
   * @template V - The return type
   * @param {MangoQuery} rawInput - The Mango Query to execute
   * @param {boolean} process - Whether to process the result
   * @return {Promise<V>} Promise resolving to the query result
   * @mermaid
   * sequenceDiagram
   *   participant Client
   *   participant FabricAdapter
   *   participant Contract
   *   participant Chaincode
   *
   *   Client->>FabricAdapter: raw(rawInput, process)
   *   FabricAdapter->>FabricAdapter: JSON.stringify(rawInput)
   *   FabricAdapter->>FabricAdapter: evaluateTransaction("query", [input])
   *   FabricAdapter->>Contract: evaluate("query", proposalOptions)
   *   Contract->>Chaincode: invoke
   *   Chaincode-->>Contract: response
   *   Contract-->>FabricAdapter: result
   *   FabricAdapter->>FabricAdapter: JSON.parse(decode(result))
   *   FabricAdapter->>FabricAdapter: Process result based on type
   *   FabricAdapter-->>Client: processed result
   */
  @debug()
  async raw<V, D extends boolean>(
    rawInput: MangoQuery,
    docsOnly: D = true as D,
    clazz: ModelConstructor<any>,
    ...args: ContextualArgs<Context<FabricClientFlags>>
  ): Promise<V> {
    const { log, ctx } = this.logCtx(args, this.raw);
    const tableName = clazz.name;
    log.info(`Performing raw statement on table ${Model.tableName(clazz)}`);
    let transactionResult: any;
    try {
      transactionResult = await this.evaluateTransaction(
        ctx,
        "raw",
        [JSON.stringify(rawInput), docsOnly],
        undefined,
        undefined,
        tableName
      );
    } catch (e: unknown) {
      throw this.parseError(e as Error);
    }
    let result: any;
    try {
      result = JSON.parse(this.decode(transactionResult));
    } catch (e: any) {
      throw new SerializationError(`Failed to process result: ${e}`);
    }

    const parseRecord = (record: Record<any, any>) => {
      if (Model.isModel(record)) return Model.build(record);
      return record;
    };

    if (Array.isArray(result)) {
      if (!result.length) return result as V;
      const el = result[0];
      if (Model.isModel(el))
        // if the first one is a model, all are models
        return result.map((el) => Model.build(el)) as V;
      return result as V;
    }

    return parseRecord(result as any) as V;
  }

  /**
   * @description Gets or creates a gRPC client for the Fabric peer
   * @summary Returns a cached client or creates a new one if none exists
   * @return {Promise<Client>} Promise resolving to the gRPC client
   */
  override getClient(): Client {
    if (!this._client)
      this._client = FabricClientAdapter.getClient(this.config);
    return this._client;
  }

  /**
   * @description Gets a Gateway instance for the Fabric network
   * @summary Creates a new Gateway instance using the current client
   * @return {Promise<Gateway>} Promise resolving to the Gateway instance
   */
  protected async Gateway(ctx: Context<FabricClientFlags>): Promise<Gateway> {
    return FabricClientAdapter.getGateway(ctx, this.config, this.client);
  }

  private getContractName(className?: string) {
    if (!className) return undefined;
    return `${className}Contract`;
  }

  /**
   * @description Gets a Contract instance for the Fabric chaincode
   * @summary Creates a new Contract instance using the current Gateway
   * @return {Promise<Contrakt>} Promise resolving to the Contract instance
   */
  protected async Contract(
    ctx: Context<FabricClientFlags>,
    contractName?: string
  ): Promise<Contrakt> {
    return FabricClientAdapter.getContract(
      await this.Gateway(ctx),
      this.config,
      contractName
    );
  }

  /**
   * @description Executes a transaction on the Fabric network
   * @summary Submits or evaluates a transaction on the Fabric chaincode
   * @param {string} api - The chaincode function to call
   * @param {boolean} submit - Whether to submit (true) or evaluate (false) the transaction
   * @param {any[]} [args] - Arguments to pass to the chaincode function
   * @param {Record<string, string>} [transientData] - Transient data for the transaction
   * @param {Array<string>} [endorsingOrganizations] - Organizations that must endorse the transaction
   * @return {Promise<Uint8Array>} Promise resolving to the transaction result
   * @mermaid
   * sequenceDiagram
   *   participant FabricAdapter
   *   participant Gateway
   *   participant Contract
   *   participant Chaincode
   *
   *   FabricAdapter->>Gateway: connect()
   *   FabricAdapter->>Contract: getContract()
   *   alt submit transaction
   *     FabricAdapter->>Contract: submit(api, proposalOptions)
   *   else evaluate transaction
   *     FabricAdapter->>Contract: evaluate(api, proposalOptions)
   *   end
   *   Contract->>Chaincode: invoke
   *   Chaincode-->>Contract: response
   *   Contract-->>FabricAdapter: result
   *   FabricAdapter->>Gateway: close()
   */
  protected async transaction(
    ctx: Context<FabricClientFlags>,
    api: string,
    submit = true,
    args?: any[],
    transientData?: Record<string, string>,
    endorsingOrganizations?: Array<string>,
    className?: string
  ): Promise<Uint8Array> {
    const log = this.log.for(this.transaction);
    const gateway = await this.Gateway(ctx);
    try {
      const contract = await this.Contract(
        ctx,
        this.getContractName(className)
      );
      log.verbose(
        `${submit ? "Submit" : "Evaluate"}ting transaction ${this.getContractName(className) || this.config.contractName}.${api}`
      );
      log.debug(`args: ${args?.map((a) => a.toString()).join("\n") || "none"}`);
      const method = submit ? contract.submit : contract.evaluate;

      endorsingOrganizations = endorsingOrganizations?.length
        ? endorsingOrganizations
        : undefined;
      const proposalOptions: ProposalOptions = {
        arguments: args || [],
        transientData: transientData,
        // ...(endorsingOrganizations && { endorsingOrganizations }) // mspId list
      };

      return await method.call(contract, api, proposalOptions);
    } catch (e: any) {
      if (e.code === 10) {
        throw new Error(`${e.details[0].message}`);
      }
      throw this.parseError(e);
    } finally {
      this.log.debug(`Closing ${this.config.mspId} gateway connection`);
      gateway.close();
    }
  }

  /**
   * @description Parses an error into a BaseError
   * @summary Converts any error into a standardized BaseError
   * @param {Error | string} err - The error to parse
   * @param {string} [reason] - Optional reason for the error
   * @return {BaseError} The parsed error
   */
  override parseError<E extends BaseError>(err: Error | string): E {
    return FabricClientAdapter.parseError<E>(err);
  }

  /**
   * @description Submits a transaction to the Fabric network
   * @summary Executes a transaction that modifies the ledger state
   * @param {string} api - The chaincode function to call
   * @param {any[]} [args] - Arguments to pass to the chaincode function
   * @param {Record<string, string>} [transientData] - Transient data for the transaction
   * @param {Array<string>} [endorsingOrganizations] - Organizations that must endorse the transaction
   * @return {Promise<Uint8Array>} Promise resolving to the transaction result
   */
  async submitTransaction(
    ctx: Context<FabricClientFlags>,
    api: string,
    args?: any[],
    transientData?: Record<string, string>,
    endorsingOrganizations?: Array<string>,
    className?: string
  ): Promise<Uint8Array> {
    return this.transaction(
      ctx,
      api,
      true,
      args,
      transientData,
      endorsingOrganizations,
      className
    );
  }

  /**
   * @description Evaluates a transaction on the Fabric network
   * @summary Executes a transaction that does not modify the ledger state
   * @param {string} api - The chaincode function to call
   * @param {any[]} [args] - Arguments to pass to the chaincode function
   * @param {Record<string, string>} [transientData] - Transient data for the transaction
   * @param {Array<string>} [endorsingOrganizations] - Organizations that must endorse the transaction
   * @return {Promise<Uint8Array>} Promise resolving to the transaction result
   */
  async evaluateTransaction(
    ctx: Context<FabricClientFlags>,
    api: string,
    args?: any[],
    transientData?: Record<string, string>,
    endorsingOrganizations?: Array<string>,
    className?: string
  ): Promise<Uint8Array> {
    return this.transaction(
      ctx,
      api,
      false,
      args,
      transientData,
      endorsingOrganizations,
      className
    );
  }

  /**
   * @description Closes the connection to the Fabric network
   * @summary Closes the gRPC client if it exists
   * @return {Promise<void>} Promise that resolves when the client is closed
   */
  async close(): Promise<void> {
    if (this.client) {
      this.log.verbose(`Closing ${this.config.mspId} gateway client`);
      this.client.close();
    }
  }

  /**
   * @description Gets a Contract instance from a Gateway
   * @summary Retrieves a chaincode contract from the specified network
   * @param {Gateway} gateway - The Gateway instance
   * @param {PeerConfig} config - The peer configuration
   * @return {Contrakt} The Contract instance
   */
  static getContract(
    gateway: Gateway,
    config: PeerConfig,
    contractName?: string
  ): Contrakt {
    const log = this.log.for(this.getContract);
    const network = this.getNetwork(gateway, config.channel);
    let contract: Contrakt;
    try {
      log.debug(
        `Retrieving chaincode ${config.chaincodeName} contract ${contractName || config.contractName} from network ${config.channel}`
      );
      contractName = contractName ? contractName : config.contractName;
      contract = network.getContract(config.chaincodeName, contractName);
    } catch (e: any) {
      throw this.parseError(e);
    }
    return contract;
  }

  /**
   * @description Gets a Network instance from a Gateway
   * @summary Connects to a specific channel on the Fabric network
   * @param {Gateway} gateway - The Gateway instance
   * @param {string} channelName - The name of the channel to connect to
   * @return {Network} The Network instance
   */
  static getNetwork(gateway: Gateway, channelName: string): Network {
    const log = Logging.for(this.getNetwork);
    let network: Network;
    try {
      log.debug(`Connecting to channel ${channelName}`);
      network = gateway.getNetwork(channelName);
    } catch (e: any) {
      throw this.parseError(e);
    }

    return network;
  }

  /**
   * @description Gets a Gateway instance for connecting to the Fabric network
   * @summary Creates a Gateway using the provided configuration and client
   * @param {PeerConfig} config - The peer configuration
   * @param {Client} [client] - Optional gRPC client, will be created if not provided
   * @return {Promise<Gateway>} Promise resolving to the Gateway instance
   */
  static async getGateway(
    ctx: Context<FabricClientFlags>,
    config: PeerConfig,
    client?: Client
  ) {
    return (await this.getConnection(
      client || (await this.getClient(config)),
      config,
      ctx
    )) as Gateway;
  }

  /**
   * @description Creates a gRPC client for connecting to a Fabric peer
   * @summary Initializes a client with TLS credentials for secure communication
   * @param {PeerConfig} config - The peer configuration
   * @return {Client} Promise resolving to the gRPC client
   */
  static getClient(config: PeerConfig): Client {
    const log = this.log.for(this.getClient);
    log.debug(`generating TLS credentials for msp ${config.mspId}`);
    let pathOrCert: string | Buffer = config.tlsCert as string | Buffer;

    if (typeof pathOrCert === "string") {
      if (
        pathOrCert.match(
          /-----BEGIN (CERTIFICATE|KEY|PRIVATE KEY)-----.+?-----END \1-----$/gms
        )
      ) {
        pathOrCert = Buffer.from(pathOrCert, "utf8");
      } else {
        try {
          pathOrCert = Buffer.from(fs.readFileSync(pathOrCert, "utf8"));
        } catch (e: unknown) {
          throw new InternalError(
            `Failed to read the tls certificate from ${pathOrCert}: ${e}`
          );
        }
      }
    }

    const tlsCredentials = grpc.credentials.createSsl(pathOrCert);
    log.debug(`generating Gateway Client for url ${config.peerEndpoint}`);
    return new Client(config.peerEndpoint, tlsCredentials, {
      "grpc.max_receive_message_length": (config.sizeLimit || 15) * 1024 * 1024,
      "grpc.max_send_message_length": (config.sizeLimit || 15) * 1024 * 1024,
    });
  }

  /**
   * @description Establishes a connection to the Fabric network
   * @summary Creates a Gateway connection with identity and signer
   * @param {Client} client - The gRPC client
   * @param {PeerConfig} config - The peer configuration
   * @return {Promise<Gateway>} Promise resolving to the connected Gateway
   * @mermaid
   * sequenceDiagram
   *   participant Caller
   *   participant FabricAdapter
   *   participant Identity
   *   participant Signer
   *   participant Gateway
   *
   *   Caller->>FabricAdapter: getConnection(client, config)
   *   FabricAdapter->>Identity: getIdentity(mspId, certDirectoryPath)
   *   Identity-->>FabricAdapter: identity
   *   FabricAdapter->>Signer: getSigner(keyDirectoryPath)
   *   Signer-->>FabricAdapter: signer
   *   FabricAdapter->>FabricAdapter: Create ConnectOptions
   *   FabricAdapter->>Gateway: connect(options)
   *   Gateway-->>FabricAdapter: gateway
   *   FabricAdapter-->>Caller: gateway
   */
  static async getConnection(
    client: Client,
    config: PeerConfig,
    ctx: Context<FabricClientFlags>
  ) {
    const log = Logging.for(this.getConnection);
    log.debug(
      `Retrieving Peer Identity for ${config.mspId} under ${config.certCertOrDirectoryPath}`
    );
    const identity = await getIdentity(
      config.mspId,
      config.certCertOrDirectoryPath as any
    );
    log.debug(`Retrieving signer key from ${config.keyCertOrDirectoryPath}`);

    let signer: Signer,
      close = () => {};
    if (!config.hsm) {
      signer = await getSigner(config.keyCertOrDirectoryPath as any);
    } else {
      const hsm = new HSMSignerFactoryCustom(config.hsm.library);
      const identifier = hsm.getSKIFromCertificatePath(
        config.certCertOrDirectoryPath as any
      );
      const pkcs11Signer = hsm.newSigner({
        label: config.hsm.tokenLabel as string,
        pin: String(config.hsm.pin) as string,
        identifier: identifier,
        // userType: 1 /*CKU_USER */,
      });
      signer = pkcs11Signer.signer;

      close = pkcs11Signer.close;
    }

    const options = {
      client,
      identity: identity,
      signer: signer,
      // Default timeouts for different gRPC calls
      evaluateOptions: () => {
        return { deadline: Date.now() + 1000 * ctx.get("evaluateTimeout") }; // defaults to 5 seconds
      },
      endorseOptions: () => {
        return { deadline: Date.now() + 1000 * ctx.get("endorseTimeout") }; // defaults to 15 seconds
      },
      submitOptions: () => {
        return { deadline: Date.now() + 1000 * ctx.get("submitTimeout") }; // defaults to 5 seconds
      },
      commitStatusOptions: () => {
        return { deadline: Date.now() + 1000 * ctx.get("commitTimeout") }; // defaults to 1 minute
      },
    } as ConnectOptions;

    log.debug(`Connecting to ${config.mspId}`);
    const gateway = connect(options);

    // TODO: replace?
    if (config.hsm) {
      gateway.close = new Proxy(gateway.close, {
        apply(target: () => void, thisArg: any, argArray: any[]): any {
          Reflect.apply(target, thisArg, argArray);
          close();
        },
      });
    }

    return gateway;
  }

  /**
   * @description Creates a new Dispatch instance for the Fabric client.
   * @summary This function is responsible for creating a new FabricClientDispatch instance that can be used to interact with the Fabric network.
   * @returns {Dispatch} A new Dispatch instance configured for the Fabric client.
   * @remarks The Dispatch instance is used to encapsulate the logic for interacting with the Fabric network, such as submitting transactions or querying data.
   * @example
   * const fabricDispatch = fabricClientAdapter.Dispatch();
   * fabricDispatch.submitTransaction('createProduct', { name: 'Product A', price: 100 });
   */
  override Dispatch(): FabricClientDispatch {
    return new FabricClientAdapter["_baseDispatch"]();
  }

  /**
   * @description Parses an error into a BaseError
   * @summary Converts any error into a standardized BaseError using the parent class implementation
   * @param {Error | string} err - The error to parse
   * @param {string} [reason] - Optional reason for the error
   * @return {BaseError} The parsed error
   */
  protected static parseError<E extends BaseError>(err: Error | string): E {
    // if (
    //   MISSING_PRIVATE_DATA_REGEX.test(
    //     typeof err === "string" ? err : err.message
    //   )
    // )
    //   return new UnauthorizedPrivateDataAccess(err) as E;
    const msg = typeof err === "string" ? err : err.message;

    if (msg.includes("MVCC_READ_CONFLICT"))
      return new MvccReadConflictError(err) as E;

    if (msg.includes("ENDORSEMENT_POLICY_FAILURE"))
      return new EndorsementPolicyError(err) as E;

    if (msg.includes("PHANTOM_READ_CONFLICT"))
      return new PhantomReadConflictError(err) as E;

    if (err instanceof Error && (err as any).code) {
      switch ((err as any).code) {
        case 9:
          return new EndorsementError(err) as E;
      }
    }

    if (msg.includes(NotFoundError.name)) return new NotFoundError(err) as E;
    if (msg.includes(ConflictError.name)) return new ConflictError(err) as E;
    if (msg.includes(BadRequestError.name))
      return new BadRequestError(err) as E;
    if (msg.includes(QueryError.name)) return new QueryError(err) as E;
    if (msg.includes(PagingError.name)) return new PagingError(err) as E;
    if (msg.includes(UnsupportedError.name))
      return new UnsupportedError(err) as E;
    if (msg.includes(MigrationError.name)) return new MigrationError(err) as E;
    if (msg.includes(ObserverError.name)) return new ObserverError(err) as E;
    if (msg.includes(AuthorizationError.name))
      return new AuthorizationError(err) as E;
    if (msg.includes(ForbiddenError.name)) return new ForbiddenError(err) as E;
    if (msg.includes(ConnectionError.name))
      return new ConnectionError(err) as E;
    if (msg.includes(SerializationError.name))
      return new SerializationError(err) as E;
    return new InternalError(err) as E;
  }
}

FabricClientAdapter.decoration();
Adapter.setCurrent(FabricFlavour);
