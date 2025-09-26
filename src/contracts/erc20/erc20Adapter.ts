import { FabricClientAdapter, PeerConfig } from "../../client";

export class FabricErc20Adapter extends FabricClientAdapter {
  /**
   * @description Creates a new FabricAdapter instance
   * @summary Initializes a new adapter for interacting with a Hyperledger Fabric network
   * @param {PeerConfig} config - Configuration for connecting to a Fabric peer
   * @param {string} [alias] - Optional alias for the adapter instance
   */
  constructor(config: PeerConfig, alias?: string) {
    super(config, alias);
  }

  async Initialize(
    name: string,
    symbol: string,
    decimals: number
  ): Promise<Record<string, any>> {
    const result = await this.submitTransaction("initialize", [
      name,
      symbol,
      decimals,
    ]);
    return this.serializer.deserialize(this.decode(result));
  }
  async Mint(amount: number): Promise<Record<string, any>> {
    const result = await this.submitTransaction("mint", [amount]);
    return this.serializer.deserialize(this.decode(result));
  }
}
