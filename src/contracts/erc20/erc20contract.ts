import { AuthorizationError, Condition } from "@decaf-ts/core";
import { Context, Transaction } from "fabric-contract-api";
import { add, sub } from "../../shared/math";
import {
  AllowanceError,
  BalanceError,
  NotInitializedError,
} from "../../shared/errors";
import { FabricContractAdapter } from "../ContractAdapter";
import { Allowance, ERC20Token, ERC20Wallet } from "./models";
import { Owner } from "../../shared/decorators";
import { FabricContractRepository } from "../FabricContractRepository";
import {
  BaseError,
  InternalError,
  NotFoundError,
  ValidationError,
} from "@decaf-ts/db-decorators";
import { FabricCrudContract } from "../crud/crud-contract";
import { FabricContractRepositoryObservableHandler } from "../FabricContractRepositoryObservableHandler";
import { ERC20Events } from "../../shared/erc20/erc20-constants";

/**
 * @description ERC20 token contract base for Hyperledger Fabric
 * @summary Implements ERC20-like token logic using repositories and adapters, providing standard token operations such as balance queries, transfers, approvals, minting and burning.
 * @param {string} name - The contract name used to scope token identity
 * @note https://eips.ethereum.org/EIPS/eip-20
 * @return {void}
 * @class FabricERC20Contract
 * @example
 * class MyTokenContract extends FabricERC20Contract {
 *   constructor() { super('MyToken'); }
 * }
 * // The contract exposes methods like Transfer, Approve, Mint, Burn, etc.
 * @mermaid
 * sequenceDiagram
 *   participant Client
 *   participant Contract
 *   participant WalletRepo
 *   participant TokenRepo
 *   participant Ledger
 *   Client->>Contract: Transfer(ctx, to, value)
 *   Contract->>WalletRepo: read(from)
 *   Contract->>WalletRepo: read(to)
 *   Contract->>Ledger: putState(updated balances)
 *   Contract-->>Client: success
 */
export abstract class FabricERC20Contract extends FabricCrudContract<ERC20Wallet> {
  private walletRepository: FabricContractRepository<ERC20Wallet>;

  private tokenRepository: FabricContractRepository<ERC20Token>;

  private allowanceRepository: FabricContractRepository<Allowance>;

  protected constructor(name: string) {
    super(name, ERC20Wallet);

    FabricERC20Contract.adapter =
      FabricERC20Contract.adapter || new FabricContractAdapter();

    this.walletRepository = FabricContractRepository.forModel(
      ERC20Wallet,
      FabricERC20Contract.adapter.alias
    );

    this.tokenRepository = FabricContractRepository.forModel(
      ERC20Token,
      FabricERC20Contract.adapter.alias
    );

    this.allowanceRepository = FabricContractRepository.forModel(
      Allowance,
      FabricERC20Contract.adapter.alias
    );
  }

  @Transaction(false)
  async TokenName(ctx: Context): Promise<string> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const select = await this.tokenRepository.select();
    const token = (await select.execute(ctx))[0];

    return token.name;
  }

  /**
   * Return the symbol of the token. E.g. “HIX”.
   *
   * @param {Context} ctx the transaction context
   * @returns {String} Returns the symbol of the token
   */
  @Transaction(false)
  async Symbol(ctx: Context): Promise<string> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const select = await this.tokenRepository.select();
    const token = (await select.execute(ctx))[0];

    return token.symbol;
  }

  /**
   * Return the number of decimals the token uses
   * e.g. 8, means to divide the token amount by 100000000 to get its user representation.
   *
   * @param {Context} ctx the transaction context
   * @returns {Number} Returns the number of decimals
   */
  @Transaction(false)
  async Decimals(ctx: Context): Promise<number> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const select = await this.tokenRepository.select();
    const token = (await select.execute(ctx))[0];

    return token.decimals;
  }

  /**
   * Return the total token supply.
   *
   * @param {Context} ctx the transaction context
   * @returns {Number} Returns the total token supply
   */
  @Transaction(false)
  async TotalSupply(ctx: Context): Promise<number> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const select = await this.walletRepository.select();
    const wallets = await select.execute(ctx);

    if (wallets.length == 0) {
      throw new NotFoundError(`The token ${this.getName()} does not exist`);
    }

    let total = 0;

    wallets.forEach((wallet) => {
      total += wallet.balance;
    });

    return total;
  }

  /**
   * BalanceOf returns the balance of the given account.
   *
   * @param {Context} ctx the transaction context
   * @param {String} owner The owner from which the balance will be retrieved
   * @returns {Number} Returns the account balance
   */
  @Transaction(false)
  async BalanceOf(ctx: Context, owner: string): Promise<number> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const wallet = await this.walletRepository.read(owner, ctx);

    return wallet.balance;
  }

  /**
   * @summary Transfer transfers tokens from client account to recipient account.
   * @description recipient account must be a valid clientID as returned by the ClientAccountID() function.
   *
   * @param {Context} ctx the transaction context
   * @param {String} to The recipient
   * @param {number} value The amount of token to be transferred
   *
   * @returns {Boolean} Return whether the transfer was successful or not
   */
  @Transaction()
  async Transfer(ctx: Context, to: string, value: number): Promise<boolean> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const from = ctx.clientIdentity.getID();

    const transferResp = await this._transfer(ctx, from, to, value);
    if (!transferResp) {
      throw new InternalError("Failed to transfer");
    }

    return true;
  }

  /**
   * Transfer `value` amount of tokens from `from` to `to`.
   *
   * @param {Context} ctx the transaction context
   * @param {String} from The sender
   * @param {String} to The recipient
   * @param {number} value The amount of token to be transferred
   * @returns {Boolean} Return whether the transfer was successful or not
   */
  @Transaction()
  async TransferFrom(
    ctx: Context,
    from: string,
    to: string,
    value: number
  ): Promise<boolean> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    // Retrieve the allowance of the spender

    const spender = ctx.clientIdentity.getID();

    const allowance = await this._getAllowance(ctx, from, spender);
    if (!allowance || allowance.value < 0) {
      throw new AllowanceError(
        `spender ${spender} has no allowance from ${from}`
      );
    }

    const currentAllowance = allowance.value;

    // Check if the transferred value is less than the allowance
    if (currentAllowance < value) {
      throw new BalanceError(
        "The spender does not have enough allowance to spend."
      );
    }

    // Decrease the allowance
    const updatedAllowance = sub(currentAllowance, value);
    const newAllowance = Object.assign({}, allowance, {
      value: updatedAllowance,
    });

    await this.allowanceRepository.update(newAllowance, ctx);

    //Realize the transfer
    const transferResp = await this._transfer(ctx, from, to, value);
    if (!transferResp) {
      throw new InternalError("Failed to transfer");
    }

    return true;
  }

  async _transfer(ctx: Context, from: string, to: string, value: number) {
    const logger = this.logFor(ctx).for(this._transfer);

    if (from === to) {
      throw new AuthorizationError(
        "cannot transfer to and from same client account"
      );
    }

    if (value < 0) {
      // transfer of 0 is allowed in ERC20, so just validate against negative amounts
      throw new BalanceError("transfer amount cannot be negative");
    }

    // Retrieve the current balance of the sender

    const fromWallet = await this.walletRepository.read(from, ctx);

    const fromBalance = fromWallet.balance;

    // Check if the sender has enough tokens to spend.
    if (fromBalance < value) {
      throw new BalanceError(`client account ${from} has insufficient funds.`);
    }

    // Retrieve the current balance of the recepient

    let toWallet: ERC20Wallet;
    let newToWallet: boolean = false;
    try {
      toWallet = await this.walletRepository.read(to, ctx);
    } catch (e: unknown) {
      if (e instanceof BaseError) {
        if (e.code === 404) {
          // Create a new wallet for the minter
          toWallet = new ERC20Wallet({
            id: to,
            balance: 0,
            token: await this.TokenName(ctx),
          });
          newToWallet = true;
        } else {
          throw new InternalError(e.message);
        }
      } else {
        throw new InternalError(e as string);
      }
    }

    const toBalance = toWallet.balance;

    // Update the balance
    const fromUpdatedBalance = sub(fromBalance, value);
    const toUpdatedBalance = add(toBalance, value);

    const updatedFromWallet = Object.assign({}, fromWallet, {
      balance: fromUpdatedBalance,
    });

    await this.walletRepository.update(updatedFromWallet, ctx);

    const updatedToWallet = Object.assign({}, toWallet, {
      balance: toUpdatedBalance,
    });

    if (newToWallet) {
      await this.walletRepository.create(updatedToWallet, ctx);
    } else {
      await this.walletRepository.update(updatedToWallet, ctx);
    }

    // Emit the Transfer event
    const transferEvent = { from, to, value: value };
    const eventHandler =
      this.repo.ObserverHandler() as FabricContractRepositoryObservableHandler;
    eventHandler
      .updateObservers("", ERC20Events.TRANSFER, "", transferEvent, ctx)
      .catch((e) => lo);

    return true;
  }

  /**
   * Allows `spender` to spend `value` amount of tokens from the owner. New Approve calls override the previous allowance.
   * @note https://eips.ethereum.org/EIPS/eip-20
   *
   * @param {Context} ctx the transaction context
   * @param {String} spender The spender
   * @param {number} value The amount of tokens to be approved for transfer
   * @returns {Boolean} Return whether the approval was successful or not
   */
  @Transaction()
  async Approve(
    ctx: Context,
    spender: string,
    value: number
  ): Promise<boolean> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);
    const logger = this.logFor(ctx).for(this.Approve);

    const owner = ctx.clientIdentity.getID();

    let allowance = await this._getAllowance(ctx, owner, spender);

    const ownerWallet = await this.walletRepository.read(owner, ctx);

    if (ownerWallet.balance < value) {
      throw new BalanceError(`client account ${owner} has insufficient funds.`);
    }

    if (allowance) {
      // Overwrite the allowance
      allowance.value = value;
      await this.allowanceRepository.update(allowance, ctx);
    } else {
      allowance = new Allowance({
        owner: owner,
        spender: spender,
        value: value,
      });

      await this.allowanceRepository.create(allowance, ctx);
    }

    // Emit the Approval event
    const approvalEvent = { owner, spender, value: value };
    const eventHandler =
      this.repo.ObserverHandler() as FabricContractRepositoryObservableHandler;
    eventHandler.updateObservers(
      logger,
      "",
      ERC20Events.APPROVAL,
      "",
      ctx,
      "",
      approvalEvent
    );

    return true;
  }

  /**
   * Returns the amount of tokens which ` ` is allowed to withdraw from `owner`.
   *
   * @param {Context} ctx the transaction context
   * @param {String} owner The owner of tokens
   * @param {String} spender The spender who are able to transfer the tokens
   * @returns {number} Return the amount of remaining tokens allowed to spent
   */
  @Transaction()
  async Allowance(
    ctx: Context,
    owner: string,
    spender: string
  ): Promise<number> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const allowance = await this._getAllowance(ctx, owner, spender);

    if (!allowance) {
      throw new AllowanceError(
        `spender ${spender} has no allowance from ${owner}`
      );
    }
    return allowance.value;
  }

  async _getAllowance(
    ctx: Context,
    owner: string,
    spender: string
  ): Promise<Allowance> {
    const allowanceCondition = Condition.and(
      Condition.attribute<Allowance>("owner").eq(owner),
      Condition.attribute<Allowance>("spender").eq(spender)
    );

    const select = await this.allowanceRepository.select();
    const allowance = await select.where(allowanceCondition).execute(ctx);
    return allowance?.[0];
  }

  // ================== Extended Functions ==========================

  /**
   * Set optional infomation for a token.
   *
   * @param {Context} ctx the transaction context
   * @param {String} name The name of the token
   * @param {String} symbol The symbol of the token
   * @param {String} decimals The decimals of the token
   * @param {String} totalSupply The totalSupply of the token
   */
  @Transaction()
  async Initialize(ctx: Context, token: ERC20Token) {
    // Check contract options are not already set, client is not authorized to change them once intitialized
    const select = await this.tokenRepository.select();
    const tokens = await select.execute(ctx);
    if (tokens.length > 0) {
      throw new AuthorizationError(
        "contract options are already set, client is not authorized to change them"
      );
    }

    token.owner = ctx.clientIdentity.getID();

    await this.tokenRepository.create(token, ctx);

    return true;
  }

  // Checks that contract options have been already initialized
  @Transaction(false)
  async CheckInitialized(ctx: Context) {
    const select = await this.tokenRepository.select();
    const tokens = await select.execute(ctx);
    if (tokens.length == 0) {
      throw new NotInitializedError(
        "contract options need to be set before calling any function, call Initialize() to initialize contract"
      );
    }
  }

  /**
   * Mint creates new tokens and adds them to minter's account balance
   *
   * @param {Context} ctx the transaction context
   * @param {number} amount amount of tokens to be minted
   * @returns {Object} The balance
   */
  @Owner()
  @Transaction()
  async Mint(ctx: Context, amount: number): Promise<void> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const logger = this.logFor(ctx).for(this.Mint);

    // Get ID of submitting client identity
    const minter = ctx.clientIdentity.getID();

    if (amount <= 0) {
      throw new ValidationError("mint amount must be a positive integer");
    }

    let minterWallet: ERC20Wallet;
    try {
      minterWallet = await this.walletRepository.read(minter, ctx);

      const currentBalance = minterWallet.balance;

      const updatedBalance = add(currentBalance, amount);

      const updatedminter = Object.assign({}, minterWallet, {
        balance: updatedBalance,
      });

      await this.walletRepository.update(updatedminter, ctx);
    } catch (e: unknown) {
      if (e instanceof BaseError) {
        if (e.code === 404) {
          // Create a new wallet for the minter
          const newWallet = new ERC20Wallet({
            id: minter,
            balance: amount,
            token: await this.TokenName(ctx),
          });
          await this.walletRepository.create(newWallet, ctx);
        } else {
          throw new InternalError(e.message);
        }
      } else {
        throw new InternalError(e as string);
      }
    }

    // Emit the Transfer event
    const transferEvent = { from: "0x0", to: minter, value: amount };
    const eventHandler =
      this.repo.ObserverHandler() as FabricContractRepositoryObservableHandler;
    eventHandler.updateObservers(ERC20Token, ERC20Events.TRANSFER, "", [
      transferEvent,
      ctx,
    ]);
  }

  /**
   * Burn redeem tokens from minter's account balance
   *
   * @param {Context} ctx the transaction context
   * @param {number} amount amount of tokens to be burned
   * @returns {Object} The balance
   */
  @Owner()
  @Transaction()
  async Burn(ctx: Context, amount: number): Promise<void> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const logger = this.logFor(ctx).for(this.Burn);

    const minter = ctx.clientIdentity.getID();

    const minterWallet = await this.walletRepository.read(minter, ctx);

    const currentBalance = minterWallet.balance;

    if (currentBalance < amount) {
      throw new BalanceError(`Minter has insufficient funds.`);
    }

    const updatedBalance = sub(currentBalance, amount);

    const updatedminter = Object.assign({}, minterWallet, {
      balance: updatedBalance,
    });

    await this.walletRepository.update(updatedminter, ctx);

    logger.info(`${amount} tokens were burned`);

    // Emit the Transfer event
    const transferEvent = { from: minter, to: "0x0", value: amount };
    const eventHandler =
      this.repo.ObserverHandler() as FabricContractRepositoryObservableHandler;
    eventHandler.updateObservers(
      logger,
      "",
      ERC20Events.TRANSFER,
      "",
      ctx,
      "",
      transferEvent
    );
  }

  /**
   * BurnFrom redeem tokens from account allowence and balance
   *
   * @param {Context} ctx the transaction context
   * @param {number} account account from where tokens will be burned
   * @param {number} amount amount of tokens to be burned
   * @returns {Object} The balance
   */
  @Owner()
  @Transaction()
  async BurnFrom(ctx: Context, account: string, amount: number): Promise<void> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const logger = this.logFor(ctx).for(this.BurnFrom);

    const accountWallet = await this.walletRepository.read(account, ctx);

    const currentBalance = accountWallet.balance;

    if (currentBalance < amount) {
      throw new BalanceError(`${account} has insufficient funds.`);
    }

    const updatedBalance = sub(currentBalance, amount);

    const updatedaccount = Object.assign({}, accountWallet, {
      balance: updatedBalance,
    });

    await this.walletRepository.update(updatedaccount, ctx);

    logger.info(`${amount} tokens were berned from ${account}`);

    // Emit the Transfer event
    const transferEvent = { from: account, to: "0x0", value: amount };
    const eventHandler =
      this.repo.ObserverHandler() as FabricContractRepositoryObservableHandler;
    eventHandler.updateObservers(
      logger,
      "",
      ERC20Events.TRANSFER,
      "",
      ctx,
      "",
      transferEvent
    );
  }

  /**
   * ClientAccountBalance returns the balance of the requesting client's account.
   *
   * @param {Context} ctx the transaction context
   * @returns {Number} Returns the account balance
   */
  @Transaction()
  async ClientAccountBalance(ctx: Context): Promise<number> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    // Get ID of submitting client identity
    const clientAccountID = ctx.clientIdentity.getID();

    const clientWallet = await this.walletRepository.read(clientAccountID, ctx);

    if (!clientWallet) {
      throw new BalanceError(`The account ${clientAccountID} does not exist`);
    }

    return clientWallet.balance;
  }

  // ClientAccountID returns the id of the requesting client's account.
  // In this implementation, the client account ID is the clientId itself.
  // Users can use this function to get their own account id, which they can then give to others as the payment address
  @Transaction()
  async ClientAccountID(ctx: Context) {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    // Get ID of submitting client identity
    const clientAccountID = ctx.clientIdentity.getID();
    return clientAccountID;
  }
}
