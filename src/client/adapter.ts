import { CouchDBAdapter, MangoQuery } from "@decaf-ts/for-couchdb";
import grpc, { Client } from "@grpc/grpc-js";
import {
  Constructor,
  Model,
  Serializer,
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

export class FabricAdapter extends CouchDBAdapter<
  PeerConfig,
  FabricFlags,
  Context<FabricFlags>
> {
  private static decoder = new TextDecoder("utf8");
  private static log = Logging.for(FabricAdapter);
  private client?: Client;

  constructor(config: PeerConfig, flavour: string = "fabric") {
    super(config, flavour);
  }

  protected decode(data: Uint8Array): string {
    return FabricAdapter.decoder.decode(data);
  }

  protected override flags<M extends Model>(
    operation: OperationKeys,
    model: Constructor<M>,
    flags: Partial<FabricFlags>
  ): FabricFlags {
    return Object.assign(
      super.flags(operation, model, Object.assign({}, this.native, flags))
    ) as FabricFlags;
  }

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

  @debug(true)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected index<M>(models: Constructor<M>): Promise<void> {
    throw new Error();
  }

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

  protected async Client(config: PeerConfig): Promise<Client> {
    if (!this.client) this.client = await FabricAdapter.getClient(config);
    return this.client;
  }

  protected async Gateway(mspId: string, config: PeerConfig): Promise<Gateway> {
    return (await FabricAdapter.getConnection(
      await this.Client(config),
      mspId,
      config
    )) as Gateway;
  }

  protected Network(gateway: Gateway, channelName: string): Network {
    const log = this.log.for(this.Network);
    let network: Network;
    try {
      log.debug(`Connecting to channel ${channelName}`);
      network = gateway.getNetwork(channelName);
    } catch (e: any) {
      throw this.parseError(e);
    }

    return network;
  }

  protected Contract(
    gateway: Gateway,
    channelName: string,
    chaincodeName: string,
    contractName: string
  ): Contrakt {
    const log = this.log.for(this.Network);
    const network = this.Network(gateway, channelName);
    let contract: Contrakt;
    try {
      log.debug(
        `Retrieving chaincode ${chaincodeName} contract ${contractName} from network ${channelName}`
      );
      contract = network.getContract(chaincodeName, contractName);
    } catch (e: any) {
      throw this.parseError(e);
    }
    return contract;
  }

  protected async transaction(
    api: string,
    submit = true,
    args?: any[],
    transientData?: Record<string, string>,
    endorsingOrganizations?: Array<string>
  ): Promise<Uint8Array> {
    const log = this.log.for(this.transaction);
    const gateway = await this.Gateway(this.native.msp as string, this.native);
    try {
      const contract = this.Contract(
        gateway,
        this.native.channel as string,
        this.native.chaincodeName as string,
        this.native.contractName as string
      );
      log.debug(
        `${submit ? "Submit" : "Evaluate"}ting transaction ${this.native.contractName}.${api} with args: ${args?.map((a) => a.toString()).join("\n") || "none"}`
      );
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
      this.log.debug(`Closing ${this.native.msp} gateway connection`);
      gateway.close();
    }
  }

  override parseError(err: Error | string, reason?: string): BaseError {
    return super.parseError(err, reason);
  }

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

  async close(): Promise<void> {
    if (this.client) {
      this.log.debug(`Closing ${this.native.msp} gateway client`);
      this.client.close();
    }
  }

  protected static async getClient(config: PeerConfig) {
    const log = this.log.for(this.getClient);
    log.debug(`Retrieving TLS cert from ${config.tlsCertPath}`);
    const tlsRootCert = await readFile(config.tlsCertPath);
    log.debug(`generating TLS credentials for msp ${config.msp}`);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    log.debug(`generating Gateway Client for url ${config.peerEndpoint}`);
    return new Client(config.peerEndpoint, tlsCredentials);
  }

  protected static async getConnection(
    client: Client,
    mspId: string,
    config: PeerConfig
  ) {
    const log = this.log.for(this.getConnection);
    log.debug(
      `Retrieving Peer Identity for ${mspId} under ${config.certDirectoryPath}`
    );
    const identity = await getIdentity(mspId, config.certDirectoryPath);
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

    log.debug(`Connecting to ${mspId}`);
    return connect(options);
  }
}
