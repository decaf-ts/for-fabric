import { CouchDBAdapter, type MangoQuery } from "@decaf-ts/for-couchdb";
import grpc, { Client } from "@grpc/grpc-js";
import {
  type Constructor,
  Model,
  type Serializer,
  stringFormat,
} from "@decaf-ts/decorator-validation";
import { debug, Logging } from "@decaf-ts/logging";
import { FabricFlags, PeerConfig } from "./types";
import {
  connect,
  ConnectOptions,
  Gateway,
  Network,
  ProposalOptions,
  Contract as Contrakt,
} from "@hyperledger/fabric-gateway";
import { getIdentity, getSigner, readFile } from "./fabric-fs";
import {
  BaseError,
  Context,
  InternalError,
  OperationKeys,
  SerializationError,
  BulkCrudOperationKeys,
} from "@decaf-ts/db-decorators";
import { final } from "@decaf-ts/core";
import { FabricClientFlavour } from "./constants";

/**
 * @description Adapter for interacting with Hyperledger Fabric networks
 * @summary The FabricAdapter extends CouchDBAdapter to provide a seamless interface for interacting with Hyperledger Fabric networks.
 * It handles connection management, transaction submission, and CRUD operations against Fabric chaincode.
 * @template PeerConfig - Configuration type for connecting to a Fabric peer
 * @template FabricFlags - Flags specific to Fabric operations
 * @template Context<FabricFlags> - Context type containing Fabric-specific flags
 * @param config - Configuration for connecting to a Fabric peer
 * @param alias - Optional alias for the adapter instance
 * @class FabricAdapter
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
export class FabricAdapter extends CouchDBAdapter<
  PeerConfig,
  FabricFlags,
  Context<FabricFlags>
> {
  /**
   * @description Static text decoder for converting Uint8Array to string
   */
  private static decoder = new TextDecoder("utf8");

  /**
   * @description Static logger instance for the FabricAdapter class
   */
  private static log = Logging.for(FabricAdapter);

  /**
   * @description gRPC client instance for connecting to the Fabric peer
   */
  private client?: Client;

  /**
   * @description Gets the logger instance for this adapter
   * @summary Returns the static logger instance for the FabricAdapter class
   * @return {Logging} The logger instance
   */
  protected override get log() {
    return FabricAdapter.log;
  }

  /**
   * @description Creates a new FabricAdapter instance
   * @summary Initializes a new adapter for interacting with a Hyperledger Fabric network
   * @param {PeerConfig} config - Configuration for connecting to a Fabric peer
   * @param {string} [alias] - Optional alias for the adapter instance
   */
  constructor(config: PeerConfig, alias?: string) {
    super(config, FabricClientFlavour, alias);
  }

  /**
   * @description Decodes a Uint8Array to a string
   * @summary Converts binary data received from Fabric to a string using UTF-8 encoding
   * @param {Uint8Array} data - The binary data to decode
   * @return {string} The decoded string
   */
  protected decode(data: Uint8Array): string {
    return FabricAdapter.decoder.decode(data);
  }

  /**
   * @description Creates operation flags for Fabric operations
   * @summary Merges default flags with provided flags for a specific operation
   * @template M - Type extending Model
   * @param {OperationKeys} operation - The operation being performed
   * @param {Constructor<M>} model - The model constructor
   * @param {Partial<FabricFlags>} flags - Partial flags to merge with defaults
   * @return {FabricFlags} The merged flags
   */
  protected override flags<M extends Model>(
    operation: OperationKeys,
    model: Constructor<M>,
    flags: Partial<FabricFlags>
  ): FabricFlags {
    return Object.assign(
      super.flags(operation, model, Object.assign({}, this.native, flags))
    ) as FabricFlags;
  }

  /**
   * @description Creates multiple records in a single transaction
   * @summary Submits a transaction to create multiple records in the Fabric ledger
   * @param {string} tableName - The name of the table/collection
   * @param {string[] | number[]} ids - Array of record identifiers
   * @param {Record<string, any>[]} models - Array of record data
   * @param {Record<string, any>} transient - Transient data for the transaction
   * @param {Serializer<any>} serializer - Serializer for the model data
   * @return {Promise<Record<string, any>[]>} Promise resolving to the created records
   */
  override async createAll(
    tableName: string,
    ids: string[] | number[],
    models: Record<string, any>[],
    transient: Record<string, any>,
    serializer: Serializer<any>
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
      [ids, models.map((m) => serializer.serialize(m))],
      transient
    );
    return serializer.deserialize(
      (this.decode(result) as any).map((r: any) => serializer.deserialize(r))
    );
  }

  /**
   * @description Reads multiple records in a single transaction
   * @summary Submits a transaction to read multiple records from the Fabric ledger
   * @param {string} tableName - The name of the table/collection
   * @param {string[] | number[]} ids - Array of record identifiers to read
   * @param {Serializer<any>} serializer - Serializer for the model data
   * @return {Promise<Record<string, any>[]>} Promise resolving to the retrieved records
   */
  override async readAll(
    tableName: string,
    ids: string[] | number[],
    serializer: Serializer<any>
  ): Promise<Record<string, any>[]> {
    const log = this.log.for(this.readAll);
    log.info(`reading ${ids.length} entries to ${tableName} table`);
    log.verbose(`pks: ${ids}`);
    const result = await this.submitTransaction(
      BulkCrudOperationKeys.DELETE_ALL,
      [ids]
    );
    return serializer.deserialize(
      (this.decode(result) as any).map((r: any) => serializer.deserialize(r))
    );
  }

  /**
   * @description Updates multiple records in a single transaction
   * @summary Submits a transaction to update multiple records in the Fabric ledger
   * @param {string} tableName - The name of the table/collection
   * @param {string[] | number[]} ids - Array of record identifiers
   * @param {Record<string, any>[]} models - Array of updated record data
   * @param {Record<string, any>} transient - Transient data for the transaction
   * @param {Serializer<any>} serializer - Serializer for the model data
   * @return {Promise<Record<string, any>[]>} Promise resolving to the updated records
   */
  override async updateAll(
    tableName: string,
    ids: string[] | number[],
    models: Record<string, any>[],
    transient: Record<string, any>,
    serializer: Serializer<any>
  ): Promise<Record<string, any>[]> {
    const log = this.log.for(this.updateAll);
    if (ids.length !== models.length)
      throw new InternalError(
        `Ids and models must have the same length: ${ids.length} != ${models.length}`
      );
    log.info(`updating ${ids.length} entries to ${tableName} table`);
    log.verbose(`pks: ${ids}`);
    const result = await this.submitTransaction(
      BulkCrudOperationKeys.CREATE_ALL,
      [ids, models.map((m) => serializer.serialize(m))],
      transient
    );
    return serializer.deserialize(
      (this.decode(result) as any).map((r: any) => serializer.deserialize(r))
    );
  }

  /**
   * @description Deletes multiple records in a single transaction
   * @summary Submits a transaction to delete multiple records from the Fabric ledger
   * @param {string} tableName - The name of the table/collection
   * @param {(string | number | bigint)[]} ids - Array of record identifiers to delete
   * @param {Serializer<any>} serializer - Serializer for the model data
   * @return {Promise<Record<string, any>[]>} Promise resolving to the deleted records
   */
  override async deleteAll(
    tableName: string,
    ids: (string | number | bigint)[],
    serializer: Serializer<any>
  ): Promise<Record<string, any>[]> {
    const log = this.log.for(this.deleteAll);
    log.info(`deleting ${ids.length} entries to ${tableName} table`);
    log.verbose(`pks: ${ids}`);
    const result = await this.submitTransaction(
      BulkCrudOperationKeys.DELETE_ALL,
      [ids]
    );
    return serializer.deserialize(
      (this.decode(result) as any).map((r: any) => serializer.deserialize(r))
    );
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
   * @param {Serializer<any>} serializer - Serializer for the model data
   * @return {Promise<Record<string, any>>} Promise resolving to the created record
   */
  @debug(true)
  @final()
  override async create(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    transient: Record<string, any>,
    serializer: Serializer<any>
  ): Promise<Record<string, any>> {
    const log = this.log.for(this.create);
    log.verbose(`adding entry to ${tableName} table`);
    log.debug(`pk: ${id}`);
    const result = await this.submitTransaction(
      OperationKeys.CREATE,
      [serializer.serialize(model)],
      transient
    );
    return serializer.deserialize(this.decode(result));
  }

  /**
   * @description Reads a single record
   * @summary Evaluates a transaction to read a record from the Fabric ledger
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The record identifier
   * @param {Serializer<any>} serializer - Serializer for the model data
   * @return {Promise<Record<string, any>>} Promise resolving to the retrieved record
   */
  @debug(true)
  @final()
  async read(
    tableName: string,
    id: string | number,
    serializer: Serializer<any>
  ): Promise<Record<string, any>> {
    const log = this.log.for(this.read);
    log.verbose(`reading entry from ${tableName} table`);
    log.debug(`pk: ${id}`);
    const result = await this.evaluateTransaction(OperationKeys.READ, [id]);
    return serializer.deserialize(this.decode(result));
  }

  /**
   * @description Updates a single record
   * @summary Submits a transaction to update a record in the Fabric ledger
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The record identifier
   * @param {Record<string, any>} model - The updated record data
   * @param {Record<string, any>} transient - Transient data for the transaction
   * @param {Serializer<any>} serializer - Serializer for the model data
   * @return {Promise<Record<string, any>>} Promise resolving to the updated record
   */
  @debug(true)
  @final()
  async update(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    transient: Record<string, any>,
    serializer: Serializer<any>
  ): Promise<Record<string, any>> {
    const log = this.log.for(this.update);
    log.verbose(`updating entry to ${tableName} table`);
    log.debug(`pk: ${id}`);
    const result = await this.submitTransaction(
      OperationKeys.UPDATE,
      [serializer.serialize(model)],
      transient
    );
    return serializer.deserialize(this.decode(result));
  }

  /**
   * @description Deletes a single record
   * @summary Submits a transaction to delete a record from the Fabric ledger
   * @param {string} tableName - The name of the table/collection
   * @param {string | number} id - The record identifier to delete
   * @param {Serializer<any>} serializer - Serializer for the model data
   * @return {Promise<Record<string, any>>} Promise resolving to the deleted record
   */
  @debug(true)
  @final()
  async delete(
    tableName: string,
    id: string | number,
    serializer: Serializer<any>
  ): Promise<Record<string, any>> {
    const log = this.log.for(this.delete);
    log.verbose(`deleting entry from ${tableName} table`);
    log.debug(`pk: ${id}`);
    const result = await this.submitTransaction(OperationKeys.DELETE, [
      tableName,
      id,
    ]);
    return serializer.deserialize(this.decode(result));
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
      throw new SerializationError(
        stringFormat("Failed to process result: {0}", e.message)
      );
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
  protected async Client(): Promise<Client> {
    if (!this.client) this.client = await FabricAdapter.getClient(this.native);
    return this.client;
  }

  /**
   * @description Gets a Gateway instance for the Fabric network
   * @summary Creates a new Gateway instance using the current client
   * @return {Promise<Gateway>} Promise resolving to the Gateway instance
   */
  protected async Gateway(): Promise<Gateway> {
    return FabricAdapter.getGateway(this.native, await this.Client());
  }

  /**
   * @description Gets a Contract instance for the Fabric chaincode
   * @summary Creates a new Contract instance using the current Gateway
   * @return {Promise<Contrakt>} Promise resolving to the Contract instance
   */
  protected async Contract(): Promise<Contrakt> {
    return FabricAdapter.getContract(await this.Gateway(), this.native);
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
        `${submit ? "Submit" : "Evaluate"}ting transaction ${this.native.contractName}.${api}`
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
      throw this.parseError(e);
    } finally {
      this.log.debug(`Closing ${this.native.mspId} gateway connection`);
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
    return FabricAdapter.parseError(err, reason);
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
  protected async submitTransaction(
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
  protected async evaluateTransaction(
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
      this.log.verbose(`Closing ${this.native.mspId} gateway client`);
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
   * @return {Promise<Client>} Promise resolving to the gRPC client
   */
  static async getClient(config: PeerConfig) {
    const log = this.log.for(this.getClient);
    log.debug(`Retrieving TLS cert from ${config.tlsCertPath}`);
    const tlsRootCert = await readFile(config.tlsCertPath);
    log.debug(`generating TLS credentials for msp ${config.mspId}`);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
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
      `Retrieving Peer Identity for ${config.mspId} under ${config.certDirectoryPath}`
    );
    const identity = await getIdentity(config.mspId, config.certDirectoryPath);
    log.debug(`Retrieving signer key from ${config.keyDirectoryPath}`);

    const signer = await getSigner(config.keyDirectoryPath);

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
