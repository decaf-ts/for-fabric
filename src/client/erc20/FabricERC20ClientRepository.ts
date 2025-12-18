import { FabricClientRepository } from "../FabricClientRepository";
import { ERC20Token, ERC20Wallet } from "../../contracts/erc20/models";
import { Model, Serializer } from "@decaf-ts/decorator-validation";
import { FabricClientAdapter } from "../FabricClientAdapter";
import { ClientSerializer } from "../../shared/ClientSerializer";
import {
  Context,
  ContextOf,
  ContextualArgs,
  EventIds,
  Sequence,
} from "@decaf-ts/core";
import {
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Constructor } from "@decaf-ts/decoration";
/**
 * Repository for interacting with ERC20 contracts on a Hyperledger Fabric network.
 * Extends the base FabricClientRepository class and utilizes the ClientSerializer for data serialization.
 */
export class FabricERC20ClientRepository<
  A extends FabricClientAdapter,
> extends FabricClientRepository<ERC20Wallet, A> {
  private static serializer = new ClientSerializer();

  protected readonly serializer: Serializer<any> =
    FabricERC20ClientRepository.serializer;

  private static decoder = new TextDecoder("utf8");

  /**
   * @description Notifies all observers of an event.
   * @summary Updates all registered observers with information about a database event.
   * @param {string} table - The table name where the event occurred.
   * @param {OperationKeys|BulkCrudOperationKeys|string} event - The type of event that occurred.
   * @param {EventIds} id - The ID or IDs of the affected records.
   * @param {...any[]} args - Additional arguments.
   * @return {Promise<void>} A promise that resolves when all observers have been notified.
   * @throws {InternalError} If the observer handler is not initialized.
   */
  override async updateObservers<M extends Model>(
    table: Constructor<M> | string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ...args: ContextualArgs<ContextOf<A>>
  ): Promise<void> {
    if (!this.observerHandler)
      throw new InternalError(
        "ObserverHandler not initialized. Did you register any observables?"
      );
    const { log, ctxArgs } = this.logCtx(args, this.updateObservers);
    log.verbose(
      `Updating ${this.observerHandler.count()} observers for ${this}`
    );

    table = (
      typeof table === "string" ? Model.get(table) : table
    ) as Constructor<M>;
    let parsedId: string | string[] | undefined;

    if (id === undefined) {
      parsedId = undefined;
    } else if (Array.isArray(id)) {
      parsedId = id.map(
        (i) => Sequence.parseValue(Model.sequenceFor(table).type, i) as string
      );
    } else {
      parsedId = Sequence.parseValue(
        Model.sequenceFor(table).type,
        id
      ) as string;
    }
    await this.observerHandler.updateObservers(
      table,
      event,
      parsedId!,
      ...ctxArgs
    );
  }

  /**
   * Decodes a Uint8Array into a string using the TextDecoder.
   *
   * @param data - The Uint8Array to decode.
   * @returns The decoded string.
   */
  decode(data: Uint8Array): string {
    return FabricERC20ClientRepository.decoder.decode(data);
  }

  constructor(adapter?: A) {
    super(adapter, ERC20Wallet);
  }

  /**
   * Retrieves the name of the ERC20 token.
   *
   * @description
   * This function interacts with the blockchain network to fetch the name of the ERC20 token.
   * It calls the "TokenName" transaction on the smart contract and decodes the returned data.
   *
   * @returns {Promise<string>} A promise that resolves with the name of the ERC20 token.
   *
   * @throws {Error} If the transaction fails or the decoding process fails.
   */
  async tokenName(): Promise<string> {
    const contextArgs = await Context.args(
      "tokenName",
      this.class,
      [],
      this.adapter,
      this._overrides || {}
    );
    const { ctx } = this.logCtx(contextArgs.args, this.clientAccountID);
    const name = await this.adapter.evaluateTransaction(ctx, "TokenName");
    return this.decode(name);
  }

  /**
   * Retrieves the symbol of the ERC20 token.
   *
   * This function interacts with the blockchain network to fetch the symbol of the ERC20 token.
   * It calls the "Symbol" transaction on the smart contract and decodes the returned data.
   *
   * @returns {Promise<string>} A promise that resolves with the symbol of the ERC20 token.
   *
   * @throws {Error} If the transaction fails or the decoding process fails.
   */
  async symbol(): Promise<string> {
    const contextArgs = await Context.args(
      "symbol",
      this.class,
      [],
      this.adapter,
      this._overrides || {}
    );
    const { ctx } = this.logCtx(contextArgs.args, this.symbol);
    const symbol = await this.adapter.evaluateTransaction(ctx, "Symbol");
    return this.decode(symbol);
  }

  /**
   * Retrieves the number of decimal places for the ERC20 token.
   *
   * This function interacts with the blockchain network to fetch the number of decimal places for the ERC20 token.
   * It calls the "Decimals" transaction on the smart contract and decodes the returned data.
   *
   * @returns {Promise<number>} A promise that resolves with the number of decimal places for the ERC20 token.
   *
   * @throws {Error} If the transaction fails or the decoding process fails.
   */
  async decimals(): Promise<number> {
    const contextArgs = await Context.args(
      "decimals",
      this.class,
      [],
      this.adapter,
      this._overrides || {}
    );
    const { ctx } = this.logCtx(contextArgs.args, this.decimals);
    const decimals = await this.adapter.evaluateTransaction(ctx, "Decimals");
    return Number(this.decode(decimals));
  }

  /**
   * Retrieves the total supply of the ERC20 token.
   *
   * This function interacts with the blockchain network to fetch the total supply of the ERC20 token.
   * It calls the "TotalSupply" transaction on the smart contract and decodes the returned data.
   *
   * @returns {Promise<number>} A promise that resolves with the total supply of the ERC20 token.
   *
   * @throws {Error} If the transaction fails or the decoding process fails.
   */
  async totalSupply(): Promise<number> {
    const contextArgs = await Context.args(
      "totalSupply",
      this.class,
      [],
      this.adapter,
      this._overrides || {}
    );
    const { ctx } = this.logCtx(contextArgs.args, this.totalSupply);
    const total = await this.adapter.evaluateTransaction(ctx, "TotalSupply");
    return Number(this.decode(total));
  }

  /**
   * Retrieves the balance of the ERC20 token for a specified owner.
   *
   * @description
   * This function interacts with the blockchain network to fetch the balance of the ERC20 token for a given owner.
   * It calls the "BalanceOf" transaction on the smart contract with the provided owner's address as a parameter.
   * The returned data is then decoded and converted to a number.
   *
   * @param owner - The address of the ERC20 token owner.
   *
   * @returns {Promise<number>} A promise that resolves with the balance of the ERC20 token for the specified owner.
   *
   * @throws {Error} If the transaction fails or the decoding process fails.
   */
  async balanceOf(owner: string): Promise<number> {
    const contextArgs = await Context.args(
      "balance",
      this.class,
      [],
      this.adapter,
      this._overrides || {}
    );
    const { ctx } = this.logCtx(contextArgs.args, this.balanceOf);
    const balance = await this.adapter.evaluateTransaction(ctx, "BalanceOf", [
      owner,
    ]);
    return Number(this.decode(balance));
  }

  /**
   * Transfers a specified amount of ERC20 tokens to a recipient.
   *
   * @description
   * This function interacts with the blockchain network to transfer a specified amount of ERC20 tokens to a recipient.
   * It calls the "Transfer" transaction on the smart contract with the recipient's address and the transfer amount as parameters.
   * The returned data is then decoded and checked to determine if the transfer was successful.
   *
   * @param to - The address of the recipient.
   * @param value - The amount of ERC20 tokens to transfer.
   *
   * @returns {Promise<boolean>} A promise that resolves with `true` if the transfer was successful, and `false` otherwise.
   *
   * @throws {Error} If the transaction fails or the decoding process fails.
   */
  async transfer(to: string, value: number): Promise<boolean> {
    const contextArgs = await Context.args(
      "transfer",
      this.class,
      [],
      this.adapter,
      this._overrides || {}
    );
    const { ctx } = this.logCtx(contextArgs.args, this.transfer);
    const transferred = await this.adapter.submitTransaction(ctx, "Transfer", [
      to,
      value.toString(),
    ]);
    return this.decode(transferred) === "true" ? true : false;
  }

  /**
   * Transfers a specified amount of ERC20 tokens from one account to another.
   *
   * @description
   * This function interacts with the blockchain network to transfer a specified amount of ERC20 tokens from one account to another.
   * For this transfer to work the spender ( account that will trigger this function ) need to have the value approved as an allowance by the sender.
   * It calls the "TransferFrom" transaction on the smart contract with the sender's address, recipient's address, and the transfer amount as parameters.
   * The returned data is then decoded and checked to determine if the transfer was successful.
   *
   * @param from - The address of the sender.
   * @param to - The address of the recipient.
   * @param value - The amount of ERC20 tokens to transfer.
   *
   * @returns {Promise<boolean>} A promise that resolves with `true` if the transfer was successful, and `false` otherwise.
   *
   * @throws {Error} If the transaction fails or the decoding process fails.
   */
  async transferFrom(
    from: string,
    to: string,
    value: number
  ): Promise<boolean> {
    const contextArgs = await Context.args(
      "transferFrom",
      this.class,
      [],
      this.adapter,
      this._overrides || {}
    );
    const { ctx } = this.logCtx(contextArgs.args, this.transferFrom);
    const transferred = await this.adapter.submitTransaction(
      ctx,
      "TransferFrom",
      [from, to, value.toString()]
    );

    return this.decode(transferred) === "true" ? true : false;
  }

  /**
   * Approves a specified amount of ERC20 tokens to be spent by a specified spender.
   *
   * This function interacts with the blockchain network to approve a specified amount of ERC20 tokens to be spent by a specified spender.
   * It calls the "Approve" transaction on the smart contract with the spender's address and the approval amount as parameters.
   * The returned data is then decoded and checked to determine if the approval was successful.
   *
   * @param spender - The address of the spender.
   * @param value - The amount of ERC20 tokens to approve for the spender.
   *
   * @returns {Promise<boolean>} A promise that resolves with `true` if the approval was successful, and `false` otherwise.
   *
   * @throws {Error} If the transaction fails or the decoding process fails.
   */
  async approve(spender: string, value: number): Promise<boolean> {
    const contextArgs = await Context.args(
      "approve",
      this.class,
      [],
      this.adapter,
      this._overrides || {}
    );
    const { ctx } = this.logCtx(contextArgs.args, this.approve);
    const approved = await this.adapter.submitTransaction(ctx, "Approve", [
      spender,
      value.toString(),
    ]);
    return this.decode(approved) === "true" ? true : false;
  }

  /**
   * Retrieves the allowance of ERC20 tokens that the specified owner has approved for a spender.
   *
   * @description
   * This function interacts with the blockchain network to fetch the allowance of ERC20 tokens that the specified owner has approved for a spender.
   * It calls the "Allowance" transaction on the smart contract with the owner's address and the spender's address as parameters.
   * The returned data is then decoded and converted to a number.
   *
   * @param owner - The address of the ERC20 token owner.
   * @param spender - The address of the spender.
   *
   * @returns {Promise<number>} A promise that resolves with the allowance of ERC20 tokens that the specified owner has approved for the spender.
   *
   * @throws {Error} If the transaction fails or the decoding process fails.
   */
  async allowance(owner: string, spender: string): Promise<number> {
    const contextArgs = await Context.args(
      "allowance",
      this.class,
      [],
      this.adapter,
      this._overrides || {}
    );
    const { ctx } = this.logCtx(contextArgs.args, this.allowance);
    const allowance = await this.adapter.submitTransaction(ctx, "Allowance", [
      owner,
      spender,
    ]);
    return Number(this.decode(allowance));
  }

  /**
   * Initializes the ERC20 contract with the provided token information.
   *
   * @description
   * This function interacts with the blockchain network to initialize the ERC20 contract with the given token information.
   * It calls the "Initialize" transaction on the smart contract with the serialized token data as a parameter.
   * The returned data is then decoded and checked to determine if the initialization was successful.
   *
   * @param token - The ERC20 token information to initialize the contract with.
   *
   * @returns {Promise<boolean>} A promise that resolves with `true` if the initialization was successful, and `false` otherwise.
   *
   * @throws {Error} If the transaction fails or the decoding process fails.
   */
  async initialize(token: ERC20Token): Promise<boolean> {
    const contextArgs = await Context.args(
      "initialize",
      this.class,
      [],
      this.adapter,
      this._overrides || {}
    );
    const { ctx } = this.logCtx(contextArgs.args, this.initialize);
    const initiliazed = await this.adapter.submitTransaction(
      ctx,
      "Initialize",
      [FabricERC20ClientRepository.serializer.serialize(token)]
    );

    return this.decode(initiliazed) === "true" ? true : false;
  }

  /**
   * Checks if the ERC20 contract has been initialized.
   *
   * This function interacts with the blockchain network to verify if the ERC20 contract has been initialized.
   * It calls the "CheckInitialized" transaction on the smart contract, which does not require any parameters.
   *
   * @returns {Promise<void>} A promise that resolves when the initialization check is completed.
   *
   * @throws {Error} If the transaction fails.
   */
  async checkInitialized(): Promise<void> {
    const contextArgs = await Context.args(
      "checkInitialized",
      this.class,
      [],
      this.adapter,
      this._overrides || {}
    );
    const { ctx } = this.logCtx(contextArgs.args, this.checkInitialized);
    await this.adapter.evaluateTransaction(ctx, "CheckInitialized");
  }

  /**
   * Mints a specified amount of ERC20 tokens.
   *
   * @description
   * This function interacts with the blockchain network to mint a specified amount of ERC20 tokens.
   * It calls the "Mint" transaction on the smart contract with the minting amount as a parameter.
   * The function does not return any value, but it updates the minter's number of tokens.
   *
   * @param amount - The amount of ERC20 tokens to mint.
   *
   * @returns {Promise<void>} A promise that resolves when the minting process is completed.
   *
   * @throws {Error} If the transaction fails.
   */
  async mint(amount: number): Promise<void> {
    const contextArgs = await Context.args(
      "mint",
      this.class,
      [],
      this.adapter,
      this._overrides || {}
    );
    const { ctx } = this.logCtx(contextArgs.args, this.mint);
    await this.adapter.submitTransaction(ctx, "Mint", [amount.toString()]);
  }

  /**
   * Burns a specified amount of ERC20 tokens from the minter's account.
   *
   * This function interacts with the blockchain network to burn a specified amount of ERC20 tokens.
   * It calls the "Burn" transaction on the smart contract with the burning amount as a parameter.
   * The function does not return any value, but it decreases the minter's number of tokens.
   *
   * @param amount - The amount of ERC20 tokens to burn.
   *
   * @returns {Promise<void>} A promise that resolves when the burning process is completed.
   *
   * @throws {Error} If the transaction fails.
   */
  async burn(amount: number): Promise<void> {
    const contextArgs = await Context.args(
      "burn",
      this.class,
      [],
      this.adapter,
      this._overrides || {}
    );
    const { ctx } = this.logCtx(contextArgs.args, this.burn);
    await this.adapter.submitTransaction(ctx, "Burn", [amount.toString()]);
  }

  /**
   * Burns a specified amount of ERC20 tokens from a specified account.
   *
   * This function interacts with the blockchain network to burn a specified amount of ERC20 tokens from a given account.
   * It calls the "BurnFrom" transaction on the smart contract with the account's address and the burning amount as parameters.
   * The function does not return any value, but it decreases the specified account's number of tokens.
   *
   * @param account - The address of the account from which to burn the ERC20 tokens.
   * @param amount - The amount of ERC20 tokens to burn.
   *
   * @returns {Promise<void>} A promise that resolves when the burning process is completed.
   *
   * @throws {Error} If the transaction fails.
   */
  async burnFrom(account: string, amount: number): Promise<void> {
    const contextArgs = await Context.args(
      "burnFrom",
      this.class,
      [],
      this.adapter,
      this._overrides || {}
    );
    const { ctx } = this.logCtx(contextArgs.args, this.burnFrom);
    await this.adapter.submitTransaction(ctx, "BurnFrom", [
      account,
      amount.toString(),
    ]);
  }

  /**
   * Retrieves the balance of ERC20 tokens associated with the client's account.
   *
   * This function interacts with the blockchain network to fetch the balance of ERC20 tokens associated with the client's account.
   * It calls the "ClientAccountBalance" transaction on the smart contract, which does not require any parameters.
   * The returned data is then decoded and converted to a number.
   *
   * @returns {Promise<number>} A promise that resolves with the balance of ERC20 tokens associated with the client's account.
   *
   * @throws {Error} If the transaction fails or the decoding process fails.
   */
  async clientAccountBalance(): Promise<number> {
    const contextArgs = await Context.args(
      "accountBalance",
      this.class,
      [],
      this.adapter,
      this._overrides || {}
    );
    const { ctx } = this.logCtx(contextArgs.args, this.clientAccountBalance);
    const serializedAccountBalance = await this.adapter.evaluateTransaction(
      ctx,
      "ClientAccountBalance"
    );

    return Number(this.decode(serializedAccountBalance));
  }

  /**
   * Retrieves the client's account ID from the blockchain network.
   *
   * This function interacts with the blockchain network to fetch the client's account ID.
   * It calls the "ClientAccountID" transaction on the smart contract, which does not require any parameters.
   * The returned data is then decoded and returned as a string.
   *
   * @returns {Promise<string>} A promise that resolves with the client's account ID.
   *
   * @throws {Error} If the transaction fails or the decoding process fails.
   */
  async clientAccountID(): Promise<string> {
    const contextArgs = await Context.args(
      "accountId",
      this.class,
      [],
      this.adapter,
      this._overrides || {}
    );
    const { ctx } = this.logCtx(contextArgs.args, this.clientAccountID);
    const clientAccountID = await this.adapter.evaluateTransaction(
      ctx,
      "ClientAccountID"
    );

    return this.decode(clientAccountID);
  }
}
