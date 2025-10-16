import { CouchDBAdapter, type MangoQuery } from "@decaf-ts/for-couchdb";
import { Client } from "@grpc/grpc-js";
import * as grpc from "@grpc/grpc-js";

import {
  type Constructor,
  Model,
  type Serializer,
} from "@decaf-ts/decorator-validation";
import { debug, Logger, Logging } from "@decaf-ts/logging";
import { FabricFlags, PeerConfig } from "../shared/types";
import {
  connect,
  ConnectOptions,
  Gateway,
  Network,
  ProposalOptions,
  Contract as Contrakt,
} from "@hyperledger/fabric-gateway";
import { getIdentity, getSigner } from "./fabric-fs";
import {
  BaseError,
  Context,
  InternalError,
  OperationKeys,
  SerializationError,
  BulkCrudOperationKeys,
  modelToTransient,
} from "@decaf-ts/db-decorators";
import {
  Adapter,
  Dispatch,
  final,
  PersistenceKeys,
  Repository,
} from "@decaf-ts/core";
import { FabricClientRepository } from "./FabricClientRepository";
import { FabricFlavour } from "../shared/constants";
import { ClientSerializer } from "../shared/ClientSerializer";
import { FabricClientDispatch } from "./FabricClientDispatch";

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
export class FabricClientAdapter extends CouchDBAdapter<
  PeerConfig,
  Client,
  FabricFlags,
  Context<FabricFlags>
> {
  /**
   * @description Static text decoder for converting Uint8Array to string
   */
  private static decoder = new TextDecoder("utf8");

  private static serializer = new ClientSerializer();

  /**
   * @description Static logger instance for the FabricAdapter class
   */
  private static log: Logger = Logging.for(FabricClientAdapter);

  /**
   * @description Gets the logger instance for this adapter
   * @summary Returns the static logger instance for the FabricAdapter class
   * @return {Logger} The logger instance
   */
  protected override get log(): Logger {
    return FabricClientAdapter.log;
  }

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

  /**
   * @description Decodes a Uint8Array to a string
   * @summary Converts binary data received from Fabric to a string using UTF-8 encoding
   * @param {Uint8Array} data - The binary data to decode
   * @return {string} The decoded string
   */
  decode(data: Uint8Array): string {
    return FabricClientAdapter.decoder.decode(data);
  }

  override repository<M extends Model<true | false>>(): Constructor<
    Repository<
      M,
      MangoQuery,
      Adapter<
        PeerConfig,
        Client,
        MangoQuery,
        FabricFlags,
        Context<FabricFlags>
      >,
      FabricFlags,
      Context<FabricFlags>
    >
  > {
    return FabricClientRepository;
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
  override async createAll(
    tableName: string,
    ids: string[] | number[],
    models: Record<string, any>[],
    transient: Record<string, any>
  ): Promise<Record<string, any>[]> {
    const log = this.log.for(this.createAll);
    if (ids.length !== models.length)
      throw new InternalError(
        `Ids and models must have the same length: ${ids.length} != ${models.length}`
      );
    log.info(`adding ${ids.length} entries to ${tableName} table`);
    log.verbose(`pks: ${ids}`);
    const result = await this.submitTransaction(
      BulkCrudOperationKeys.CREATE_ALL,
      [ids, models.map((m) => this.serializer.serialize(m, tableName))],
      transient
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
  override async readAll(
    tableName: string,
    ids: string[] | number[]
  ): Promise<Record<string, any>[]> {
    const log = this.log.for(this.readAll);
    log.info(`reading ${ids.length} entries to ${tableName} table`);
    log.verbose(`pks: ${ids}`);
    const result = await this.submitTransaction(
      BulkCrudOperationKeys.READ_ALL,
      [ids]
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
  override async updateAll(
    tableName: string,
    ids: string[] | number[],
    models: Record<string, any>[],
    transient: Record<string, any>
  ): Promise<Record<string, any>[]> {
    const log = this.log.for(this.updateAll);
    if (ids.length !== models.length)
      throw new InternalError(
        `Ids and models must have the same length: ${ids.length} != ${models.length}`
      );
    log.info(`updating ${ids.length} entries to ${tableName} table`);
    log.verbose(`pks: ${ids}`);
    const result = await this.submitTransaction(
      BulkCrudOperationKeys.UPDATE_ALL,
      [ids, models.map((m) => this.serializer.serialize(m, tableName))],
      transient
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
  override async deleteAll(
    tableName: string,
    ids: (string | number | bigint)[]
  ): Promise<Record<string, any>[]> {
    const log = this.log.for(this.deleteAll);
    log.info(`deleting ${ids.length} entries to ${tableName} table`);
    log.verbose(`pks: ${ids}`);
    const result = await this.submitTransaction(
      BulkCrudOperationKeys.DELETE_ALL,
      [ids]
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
    pk: keyof M
  ): {
    record: Record<string, any>;
    id: string;
    transient?: Record<string, any>;
  } {
    const log = this.log.for(this.prepare);
    const split = modelToTransient(model);
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
      id: model[pk] as string,
      transient: split.transient,
    };
  }

  /**
   * @description Converts database data back into a model instance
   * @summary Reconstructs a model instance from database data, handling column mapping
   * and reattaching transient properties
   * @template M - The model type
   * @param obj - The database record
   * @param {string|Constructor<M>} clazz - The model class or name
   * @param pk - The primary key property name
   * @param {string|number|bigint} id - The primary key value
   * @param [transient] - Transient properties to reattach
   * @return {M} The reconstructed model instance
   */
  override revert<M extends Model>(
    obj: Record<string, any>,
    clazz: string | Constructor<M>,
    pk: keyof M,
    id: string | number | bigint,
    transient?: Record<string, any>
  ): M {
    const log = this.log.for(this.revert);
    const ob: Record<string, any> = {};
    ob[pk as string] = id;
    const m = (
      typeof clazz === "string" ? Model.build(ob, clazz) : new clazz(ob)
    ) as M;
    log.silly(`Rebuilding model ${m.constructor.name} id ${id}`);
    const metadata = obj[PersistenceKeys.METADATA];
    const result = Object.keys(m).reduce((accum: M, key) => {
      (accum as Record<string, any>)[key] = obj[key];
      return accum;
    }, m);

    if (transient) {
      log.verbose(
        `re-adding transient properties: ${Object.keys(transient).join(", ")}`
      );
      Object.entries(transient).forEach(([key, val]) => {
        if (key in result && (result as any)[key] !== undefined)
          throw new InternalError(
            `Transient property ${key} already exists on model ${m.constructor.name}. should be impossible`
          );
        result[key as keyof M] = val;
      });
    }

    if (metadata) {
      log.silly(
        `Passing along ${this.flavour} persistence metadata for ${m.constructor.name} id ${id}: ${metadata}`
      );
      Object.defineProperty(result, PersistenceKeys.METADATA, {
        enumerable: false,
        configurable: false,
        writable: false,
        value: metadata,
      });
    }

    return result;
  }

  /**
   * @description Creates an index for a model
   * @summary This method is not implemented for Fabric and will throw an error
   * @template M - Type extending Model
   * @param {Constructor<M>} models - The model constructor
   * @return {Promise<void>} Promise that will throw an error
   */
  @debug(true)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected index<M>(models: Constructor<M>): Promise<void> {
    throw new Error();
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
  @debug(true)
  @final()
  override async create(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    transient: Record<string, any>
  ): Promise<Record<string, any>> {
    const log = this.log.for(this.create);
    log.verbose(`adding entry to ${tableName} table`);
    log.debug(`pk: ${id}`);
    const result = await this.submitTransaction(
      OperationKeys.CREATE,
      [this.serializer.serialize(model, tableName)],
      transient
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
  @debug(true)
  @final()
  async read(
    tableName: string,
    id: string | number
  ): Promise<Record<string, any>> {
    const log = this.log.for(this.read);
    log.verbose(`reading entry from ${tableName} table`);
    log.debug(`pk: ${id}`);
    const result = await this.evaluateTransaction(OperationKeys.READ, [
      id.toString(),
    ]);
    return this.serializer.deserialize(this.decode(result));
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
  @debug(true)
  @final()
  async update(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    transient: Record<string, any>
  ): Promise<Record<string, any>> {
    const log = this.log.for(this.update);
    log.verbose(`updating entry to ${tableName} table`);
    log.debug(`pk: ${id}`);
    const result = await this.submitTransaction(
      OperationKeys.UPDATE,
      [this.serializer.serialize(model, tableName)],
      transient
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
  @debug(true)
  @final()
  async delete(
    tableName: string,
    id: string | number
  ): Promise<Record<string, any>> {
    const log = this.log.for(this.delete);
    log.verbose(`deleting entry from ${tableName} table`);
    log.debug(`pk: ${id}`);
    const result = await this.submitTransaction(OperationKeys.DELETE, [
      tableName,
      id,
    ]);
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
  @debug(true)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async raw<V>(rawInput: MangoQuery, process: boolean): Promise<V> {
    const log = this.log.for(this.raw);
    log.info(`Performing raw  query on table`);
    log.debug(`processing raw input for query: ${JSON.stringify(rawInput)}`);
    let input: string;
    try {
      input = JSON.stringify(rawInput);
    } catch (e: any) {
      throw new SerializationError(
        `Failed to process raw input for query: ${e}`
      );
    }
    let transactionResult: any;
    try {
      transactionResult = await this.evaluateTransaction("query", [input]);
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
  protected async Gateway(): Promise<Gateway> {
    return FabricClientAdapter.getGateway(this.config, this.client);
  }

  /**
   * @description Gets a Contract instance for the Fabric chaincode
   * @summary Creates a new Contract instance using the current Gateway
   * @return {Promise<Contrakt>} Promise resolving to the Contract instance
   */
  protected async Contract(): Promise<Contrakt> {
    return FabricClientAdapter.getContract(await this.Gateway(), this.config);
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
    api: string,
    submit = true,
    args?: any[],
    transientData?: Record<string, string>,
    endorsingOrganizations?: Array<string>
  ): Promise<Uint8Array> {
    const log = this.log.for(this.transaction);
    const gateway = await this.Gateway();
    try {
      const contract = await this.Contract();
      log.verbose(
        `${submit ? "Submit" : "Evaluate"}ting transaction ${this.config.contractName}.${api}`
      );
      log.debug(`args: ${args?.map((a) => a.toString()).join("\n") || "none"}`);
      const method = submit ? contract.submit : contract.evaluate;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  override parseError(err: Error | string, reason?: string): BaseError {
    return FabricClientAdapter.parseError(err, reason);
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
    api: string,
    args?: any[],
    transientData?: Record<string, string>,
    endorsingOrganizations?: Array<string>
  ): Promise<Uint8Array> {
    return this.transaction(
      api,
      true,
      args,
      transientData,
      endorsingOrganizations
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
    api: string,
    args?: any[],
    transientData?: Record<string, string>,
    endorsingOrganizations?: Array<string>
  ): Promise<Uint8Array> {
    return this.transaction(
      api,
      false,
      args,
      transientData,
      endorsingOrganizations
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
  static getContract(gateway: Gateway, config: PeerConfig): Contrakt {
    const log = this.log.for(this.getContract);
    const network = this.getNetwork(gateway, config.channel);
    let contract: Contrakt;
    try {
      log.debug(
        `Retrieving chaincode ${config.chaincodeName} contract ${config.contractName} from network ${config.channel}`
      );
      contract = network.getContract(config.chaincodeName, config.contractName);
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
    const log = this.log.for(this.getNetwork);
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
  static async getGateway(config: PeerConfig, client?: Client) {
    return (await this.getConnection(
      client || (await this.getClient(config)),
      config
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
    const tlsCredentials = grpc.credentials.createSsl(
      typeof config.tlsCert === "string"
        ? Buffer.from(config.tlsCert)
        : config.tlsCert
    );
    log.debug(`generating Gateway Client for url ${config.peerEndpoint}`);
    return new Client(config.peerEndpoint, tlsCredentials);
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
  static async getConnection(client: Client, config: PeerConfig) {
    const log = this.log.for(this.getConnection);
    log.debug(
      `Retrieving Peer Identity for ${config.mspId} under ${config.certCertOrDirectoryPath}`
    );
    const identity = await getIdentity(
      config.mspId,
      config.certCertOrDirectoryPath
    );
    log.debug(`Retrieving signer key from ${config.keyCertOrDirectoryPath}`);

    const signer = await getSigner(config.keyCertOrDirectoryPath);

    const options = {
      client,
      identity: identity,
      signer: signer,
      // Default timeouts for different gRPC calls
      evaluateOptions: () => {
        return { deadline: Date.now() + 5000 }; // 5 seconds
      },
      endorseOptions: () => {
        return { deadline: Date.now() + 15000 }; // 15 seconds
      },
      submitOptions: () => {
        return { deadline: Date.now() + 5000 }; // 5 seconds
      },
      commitStatusOptions: () => {
        return { deadline: Date.now() + 60000 }; // 1 minute
      },
    } as ConnectOptions;

    log.debug(`Connecting to ${config.mspId}`);
    return connect(options);
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
  override Dispatch(): Dispatch {
    return new FabricClientDispatch(this.getClient());
  }

  /**
   * @description Parses an error into a BaseError
   * @summary Converts any error into a standardized BaseError using the parent class implementation
   * @param {Error | string} err - The error to parse
   * @param {string} [reason] - Optional reason for the error
   * @return {BaseError} The parsed error
   */
  protected static override parseError(
    err: Error | string,
    reason?: string
  ): BaseError {
    return super.parseError(err, reason);
  }
}

FabricClientAdapter.decoration();
Adapter.setCurrent(FabricFlavour);
