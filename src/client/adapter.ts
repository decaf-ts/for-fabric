import { CouchDBAdapter, MangoQuery } from "@decaf-ts/for-couchdb";
import grpc, { Client } from "@grpc/grpc-js";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { User } from "fabric-common";
import {
  logAsDebug,
  logAsSilly,
  logAsVerbose,
  Logger,
  Logging,
} from "@decaf-ts/logging";
import { CAConfig, PeerConfig } from "./types";
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
  InternalError,
  modelToTransient,
  OperationKeys,
  SerializationError,
} from "@decaf-ts/db-decorators";
import { FabricCAService } from "./services/FabricCAService";

export class FabricAdapter extends CouchDBAdapter<PeerConfig> {
  protected static decoder = new TextDecoder("utf8");

  protected static readonly log: Logger = Logging.for(FabricAdapter);
  protected readonly log: Logger = FabricAdapter.log;

  private client?: Client;

  private ca?: FabricCAService;

  private currentUser?: string;

  constructor(config: PeerConfig, flavour: string = "fabric") {
    super(config, flavour);
  }

  protected index<M>(models: Constructor<M>): Promise<void> {
    throw new Error(`Not implemented`);
  }

  @logAsSilly()
  prepare<M extends Model>(
    m: M,
    pk: string | number
  ): {
    record: Record<string, any>;
    id: string;
    transient: Record<string, any>;
  } {
    const log = this.log.for(this.prepare);
    const { model, transient } = modelToTransient(m);
    log.debug(
      `after transient split: ${JSON.stringify(model, null, 2)}\ntransient: ${JSON.stringify(transient, null, 2)}`
    );
    const prepared = super.prepare(model, pk);
    return {
      record: prepared.record,
      id: prepared.id,
      transient: transient || {},
    };
  }

  @logAsSilly()
  revert<M extends Model>(
    obj: Record<string, any>,
    clazz: string | Constructor<M>,
    pk: string,
    id: string | number | bigint
  ): M {
    return super.revert(obj, clazz, pk, id);
  }

  @logAsDebug(true)
  impersonate(cfg: Partial<PeerConfig>): FabricAdapter {
    return new Proxy(this, {
      get: (target, prop) => {
        if (prop === "native") return Object.assign({}, target.native, cfg);
        if (prop in target) {
          return target[prop as keyof FabricAdapter];
        }
      },
    });
  }

  protected forTable(tableName: string) {
    return this.impersonate({
      contractName: tableName,
    });
  }

  @logAsSilly(true)
  async create(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    transient: Record<string, any> = {}
  ): Promise<Record<string, any>> {
    const log = this.log.for(this.create);
    log.info(`Creating record ${tableName}.${id}`);
    const result = await this.forTable(tableName).submitTransaction(
      OperationKeys.CREATE,
      [model.serialize()],
      transient
    );

    let decoded;
    try {
      decoded = JSON.parse(FabricAdapter.decoder.decode(result));
    } catch (e: unknown) {
      throw new InternalError(`Failed to decode result: ${e}`);
    }
    return decoded;
  }

  @logAsSilly(true)
  async read(
    tableName: string,
    id: string | number
  ): Promise<Record<string, any>> {
    const result = await this.forTable(tableName).evaluateTransaction(
      OperationKeys.READ,
      [id]
    );

    let decoded;
    try {
      decoded = JSON.parse(FabricAdapter.decoder.decode(result));
    } catch (e: unknown) {
      throw new InternalError(`Failed to decode result: ${e}`);
    }
    return decoded;
  }

  @logAsSilly(true)
  async update(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    transient: Record<string, any> = {}
  ): Promise<Record<string, any>> {
    const log = this.log.for(this.update);
    log.info(`Updating record ${tableName}.${id}`);
    log.verbose(`with model: ${JSON.stringify(model, null, 2)}`, 3);
    log.debug(`with transient: ${JSON.stringify(transient, null, 2)}`);
    const result = await this.forTable(tableName).submitTransaction(
      OperationKeys.UPDATE,
      [model.serialize()],
      transient
    );

    let decoded;
    try {
      decoded = JSON.parse(FabricAdapter.decoder.decode(result));
    } catch (e: unknown) {
      log.debug(`Failed to decode result: ${e}`);
      throw new InternalError(`Failed to decode result: ${e}`);
    }
    log.debug(`decoded result: ${JSON.stringify(decoded, null, 2)}`);
    return decoded;
  }

  @logAsSilly(true)
  async delete(
    tableName: string,
    id: string | number
  ): Promise<Record<string, any>> {
    const log = this.log.for(this.delete);
    log.verbose(`deleting record ${tableName}.${id}`, 3);
    const result = await this.forTable(tableName).evaluateTransaction(
      OperationKeys.READ,
      [id]
    );

    let decoded;
    try {
      decoded = JSON.parse(FabricAdapter.decoder.decode(result));
    } catch (e: unknown) {
      log.debug(`Failed to decode result: ${e}`);
      throw new InternalError(`Failed to decode result: ${e}`);
    }
    return decoded;
  }

  @logAsSilly(true)
  createAll(
    tableName: string,
    ids: string[] | number[],
    models: Record<string, any>[]
  ): Promise<Record<string, any>[]> {
    throw new Error("Method not implemented.");
  }

  @logAsSilly()
  readAll(
    tableName: string,
    ids: (string | number | bigint)[]
  ): Promise<Record<string, any>[]> {
    throw new Error("Method not implemented.");
  }

  @logAsSilly()
  updateAll(
    tableName: string,
    ids: string[] | number[],
    models: Record<string, any>[]
  ): Promise<Record<string, any>[]> {
    throw new Error("Method not implemented.");
  }

  @logAsSilly()
  deleteAll(
    tableName: string,
    ids: (string | number | bigint)[]
  ): Promise<Record<string, any>[]> {
    throw new Error("Method not implemented.");
  }

  @logAsSilly()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async raw<V>(rawInput: MangoQuery, process: boolean): Promise<V> {
    const log = this.log.for(this.raw);
    let input: string;
    try {
      input = JSON.stringify(rawInput);
    } catch (e: unknown) {
      throw new InternalError(`Failed to process raw input for query: ${e}`);
    }
    let transactionResult: any;
    try {
      transactionResult = await this.evaluateTransaction("query", [input]);
    } catch (e: any) {
      throw this.parseError(e);
    }
    let result: any;
    try {
      result = JSON.parse(FabricAdapter.decoder.decode(transactionResult));
    } catch (e: unknown) {
      throw new SerializationError(`Failed to process result: ${e}`);
    }
    log.debug(`raw result: ${JSON.stringify(result, null, 2)}`);
    const parseRecord = (record: Record<any, any>) => {
      if (Model.isModel(record)) return Model.build(record);
      return record;
    };

    if (Array.isArray(result)) {
      if (!result.length) return result as V;
      const el = result[0];
      if (Model.isModel(el)) {
        log.debug(`raw result is an array of models. building...`);
        // if the first one is a model, all are models
        return result.map((el) => Model.build(el)) as V;
      }
      return result as V;
    }

    return parseRecord(result as any) as V;
  }

  protected user(): Promise<User> {
    const log = this.log.for(this.user);
    this.CA().
  }

  protected async Client(): Promise<Client> {
    if (!this.client) this.client = await FabricAdapter.getClient(this.native);
    return this.client;
  }

  protected CA(): FabricCAService {
    if (!this.ca) this.ca = FabricAdapter.getCA(this.native);
    return this.ca;
  }

  protected async Gateway(): Promise<Gateway> {
    return (await FabricAdapter.getConnection(
      await this.Client(),
      this.native
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

  @logAsVerbose()
  protected Contract(
    gateway: Gateway,
    channelName: string,
    chaincodeName: string,
    contractName: string
  ): Contrakt {
    const log = this.log.for(this.Contract);
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

  @logAsDebug(true)
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
      const contract = this.Contract(
        gateway,
        this.native.channel as string,
        this.native.chaincodeName as string,
        this.native.contractName as string
      );

      log.verbose(
        `${submit ? "Submit" : "Evaluate"}ting transaction ${this.native.contractName}.${api}`
      );
      const method = submit ? contract.submit : contract.evaluate;

      // TODO
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
      log.verbose(
        `Failed to ${submit ? "submit" : "evaluate"} transaction: ${e}`,
        3
      );
      throw this.parseError(e);
    } finally {
      this.log.verbose(`Closing ${this.native.msp} gateway connection`, 3);
      gateway.close();
    }
  }

  protected parseError(err: Error | string, reason?: string): BaseError {
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

  async destroy(): Promise<void> {
    if (this.client) {
      const log = this.log.for(this.destroy);
      log.verbose(`Closing ${this.native.msp} gateway client`);
      try {
        this.client.close();
        await super.destroy();
      } catch (e: unknown) {
        log.error(`Failed to gracefully close client: ${e}`);
      }
    }
  }

  toString(){
    return `${this.flavour} adapter (msp: ${this.native.msp}, ca: ${this.native.caName})`;
  }

  protected static async getClient(config: PeerConfig) {
    const log = this.log.for(this.getClient);
    log.debug(`Retrieving TLS cert from ${config.tlsCertPath}`);
    const tlsRootCert = await readFile(config.tlsCertPath);
    log.verbose(`generating TLS credentials for msp ${config.msp}`);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    log.debug(`generating Gateway Client for url ${config.peerEndpoint}`);
    return new Client(config.peerEndpoint, tlsCredentials);
  }

  protected static getCA(config: CAConfig) {
    return new FabricCAService(config);
  }

  protected static async getConnection(
    client: Client,
    config: PeerConfig
  ): Promise<Gateway> {
    const log = this.log.for(this.getConnection);
    const mspId = config.msp as string;
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

    log.verbose(`Connecting to ${mspId}`);
    return connect(options);
  }
}
