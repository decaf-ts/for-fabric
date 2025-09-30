import { FabricClientRepository } from "../../client/FabricClientRepository";
import { ERC20Token, ERC20Wallet } from "./models";
import { Constructor, Serializer } from "@decaf-ts/decorator-validation";
import { FabricClientAdapter } from "../../client/FabricClientAdapter";
import { ClientSerializer } from "../../shared/ClientSerializer";
/**
 * Repository for interacting with ERC20 contracts on a Hyperledger Fabric network.
 * Extends the base FabricClientRepository class and utilizes the ClientSerializer for data serialization.
 */
export class FabricERC20ClientRepository extends FabricClientRepository<ERC20Wallet> {
  private static serializer = new ClientSerializer();

  protected readonly serializer: Serializer<any> =
    FabricERC20ClientRepository.serializer;

  private static decoder = new TextDecoder("utf8");

  decode(data: Uint8Array): string {
    return FabricERC20ClientRepository.decoder.decode(data);
  }

  protected override get adapter(): FabricClientAdapter {
    return super.adapter as FabricClientAdapter;
  }

  constructor(adapter?: FabricClientAdapter) {
    super(adapter, ERC20Wallet);
  }

  async tokenName(): Promise<string> {
    const name = await this.adapter.submitTransaction("TokenName");
    return this.decode(name);
  }

  async symbol(): Promise<string> {
    const symbol = await this.adapter.submitTransaction("Symbol");
    return this.decode(symbol);
  }

  async decimals(): Promise<number> {
    const decimals = await this.adapter.submitTransaction("Decimals");
    return Number(this.decode(decimals));
  }

  async totalSupplys(): Promise<number> {
    const total = await this.adapter.submitTransaction("TotalSupply");
    return Number(this.decode(total));
  }

  async balanceOf(owner: string): Promise<number> {
    const balance = await this.adapter.submitTransaction("BalanceOf", [owner]);
    return Number(this.decode(balance));
  }

  async transfer(to: string, value: number): Promise<boolean> {
    const transferred = await this.adapter.submitTransaction("Transfer", [
      to,
      value.toString(),
    ]);
    return this.decode(transferred) === "true" ? true : false;
  }

  async transferFrom(
    from: string,
    to: string,
    value: number
  ): Promise<boolean> {
    const transferred = await this.adapter.submitTransaction("TransferFrom", [
      from,
      to,
      value.toString(),
    ]);

    return this.decode(transferred) === "true" ? true : false;
  }

  async approve(spender: string, value: number): Promise<boolean> {
    const approved = await this.adapter.submitTransaction("Approve", [
      spender,
      value.toString(),
    ]);
    return this.decode(approved) === "true" ? true : false;
  }

  async allowance(owner: string, spender: string): Promise<number> {
    const allowance = await this.adapter.submitTransaction("Allowance", [
      owner,
      spender,
    ]);
    return Number(this.decode(allowance));
  }

  async initialize(token: ERC20Token): Promise<boolean> {
    const initiliaized = await this.adapter.submitTransaction("Initialize", [
      FabricERC20ClientRepository.serializer.serialize(token),
    ]);

    return this.decode(initiliaized) === "true" ? true : false;
  }

  async mint(amount: number): Promise<void> {
    await this.adapter.submitTransaction("Mint", [amount.toString()]);
  }

  async burn(amount: number): Promise<void> {
    await this.adapter.submitTransaction("Burn", [amount.toString()]);
  }

  async burnFrom(account: string, amount: number): Promise<void> {
    await this.adapter.submitTransaction("BurnFrom", [
      account,
      amount.toString(),
    ]);
  }

  async clientAccountBalance(): Promise<number> {
    const serializedAccountBalance = await this.adapter.submitTransaction(
      "ClientAccountBalance"
    );

    return Number(this.decode(serializedAccountBalance));
  }

  async clientAccountID(): Promise<string> {
    const clientAccountID =
      await this.adapter.submitTransaction("ClientAccountID");

    return this.decode(clientAccountID);
  }
}
