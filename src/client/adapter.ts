import { CouchDBAdapter, MangoQuery } from "@decaf-ts/for-couchdb";
import grpc, { Client } from "@grpc/grpc-js";
import { Constructor } from "@decaf-ts/decorator-validation";
import { User } from "fabric-common";
import { debug, Logger, Logging } from "@decaf-ts/logging";
import { PeerConfig } from "./types";
import {
  connect,
  ConnectOptions,
  Gateway,
  Network,
  ProposalOptions,
  Contract as Contrakt,
} from "@hyperledger/fabric-gateway";
import { getIdentity, getSigner, readFile } from "./fabric-fs";
import { BaseError } from "@decaf-ts/db-decorators";

export class FabricAdapter extends CouchDBAdapter<PeerConfig> {
  protected static decoder = new TextDecoder("utf8");

  protected static readonly log: Logger = Logging.for(FabricAdapter);
  protected readonly log: Logger = FabricAdapter.log;

  private client?: Client;

  constructor(config: PeerConfig, flavour: string = "fabric") {
    super(config, flavour);
  }

  @debug(true)
  protected index<M>(models: Constructor<M>): Promise<void> {
    throw new Error();
  }

  @debug(true)
  create(
    tableName: string,
    id: string | number,
    model: Record<string, any>
  ): Promise<Record<string, any>> {
    const log = this.log.for(this.create);
    return Promise.resolve(undefined);
  }

  @debug(true)
  delete(tableName: string, id: string | number): Promise<Record<string, any>> {
    const log = this.log.for(this.delete);
    return Promise.resolve(undefined);
  }
  @debug(true)
  raw<V>(rawInput: MangoQuery, process: boolean): Promise<V> {
    const log = this.log.for(this.raw);
    return Promise.resolve(undefined);
  }

  @debug(true)
  read(tableName: string, id: string | number): Promise<Record<string, any>> {
    const log = this.log.for(this.read);
    return Promise.resolve(undefined);
  }

  @debug(true)
  update(
    tableName: string,
    id: string | number,
    model: Record<string, any>
  ): Promise<Record<string, any>> {
    const log = this.log.for(this.update);
    return Promise.resolve(undefined);
  }

  protected user(): Promise<User> {
    const log = this.log.for(this.user);
    return Promise.resolve(undefined);
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
