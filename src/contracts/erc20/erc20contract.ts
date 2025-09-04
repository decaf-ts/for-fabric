import { AuthorizationError, Condition } from "@decaf-ts/core";
import { Transaction } from "fabric-contract-api";
import { add, sub } from "../../shared/math";
import { BalanceError } from "../../shared/errors";
import { FabricContractAdapter } from "../ContractAdapter";
import { Allowance, ERC20Token, ERC20Wallet } from "./models";
import { FabricContractContext } from "../ContractContext";
import { FabricCrudContract } from "../crud";
import { Owner } from "../../shared/decorators";
import { FabricContractRepository } from "../FabricContractRepository";
import {
  InternalError,
  NotFoundError,
  ValidationError,
} from "@decaf-ts/db-decorators";

export abstract class FabricERC20Contract extends FabricCrudContract<ERC20Wallet> {
  private walletRepository: FabricContractRepository<ERC20Wallet>;

  private tokenRepository: FabricContractRepository<ERC20Token>;

  private allowanceRepository: FabricContractRepository<Allowance>;

  constructor(name: string) {
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
  async TokenName(ctx: FabricContractContext): Promise<string> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const token = (
      await this.tokenRepository.select(undefined, ctx).execute()
    )[0];

    return token.name;
  }

  /**
   * Return the symbol of the token. E.g. “HIX”.
   *
   * @param {Context} ctx the transaction context
   * @returns {String} Returns the symbol of the token
   */
  @Transaction(false)
  async Symbol(ctx: FabricContractContext): Promise<string> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const token = (
      await this.tokenRepository.select(undefined, ctx).execute()
    )[0];
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
  async Decimals(ctx: FabricContractContext): Promise<number> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const token = (
      await this.tokenRepository.select(undefined, ctx).execute()
    )[0];
    return token.decimals;
  }

  /**
   * Return the total token supply.
   *
   * @param {FabricContractContext} ctx the transaction context
   * @returns {Number} Returns the total token supply
   */
  @Transaction(false)
  async TotalSupply(ctx: FabricContractContext): Promise<number> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const condition = Condition.attribute<ERC20Wallet>("token").eq(
      this.getName()
    );

    const wallets = await this.walletRepository
      .select()
      .where(condition)
      .execute();

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
   * @param {FabricContractContext} ctx the transaction context
   * @param {String} owner The owner from which the balance will be retrieved
   * @returns {Number} Returns the account balance
   */
  @Transaction()
  async BalanceOf(ctx: FabricContractContext, owner: string): Promise<number> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const wallet = await this.walletRepository.read(owner);

    return wallet.balance;
  }

  /**
   * @summary Transfer transfers tokens from client account to recipient account.
   * @description recipient account must be a valid clientID as returned by the ClientAccountID() function.
   *
   * @param {FabricContractContext} ctx the transaction context
   * @param {String} to The recipient
   * @param {number} value The amount of token to be transferred
   *
   * @returns {Boolean} Return whether the transfer was successful or not
   */
  @Transaction()
  async Transfer(
    ctx: FabricContractContext,
    to: string,
    value: number
  ): Promise<boolean> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const from = ctx.identity.getID();

    const transferResp = await this._transfer(ctx, from, to, value);
    if (!transferResp) {
      throw new InternalError("Failed to transfer");
    }

    // Emit the Transfer event
    const transferEvent = { from, to, value: value };
    ctx.stub.setEvent("Transfer", Buffer.from(JSON.stringify(transferEvent)));

    return true;
  }

  /**
   * Transfer `value` amount of tokens from `from` to `to`.
   *
   * @param {FabricContractContext} ctx the transaction context
   * @param {String} from The sender
   * @param {String} to The recipient
   * @param {number} value The amount of token to be transferred
   * @returns {Boolean} Return whether the transfer was successful or not
   */
  @Transaction()
  async TransferFrom(
    ctx: FabricContractContext,
    from: string,
    to: string,
    value: number
  ): Promise<boolean> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    // Retrieve the allowance of the spender

    const spender = ctx.identity.getID();

    const allowanceCondition = Condition.and(
      Condition.attribute<Allowance>("owner").eq(from),
      Condition.attribute<Allowance>("spender").eq(spender)
    );

    const allowance = await this.allowanceRepository
      .select()
      .where(allowanceCondition)
      .execute();

    if (!allowance[0] || allowance[0].value < 0) {
      throw new AuthorizationError(
        `spender ${spender} has no allowance from ${from}`
      );
    }

    const currentAllowance = allowance[0].value;

    // Check if the transferred value is less than the allowance
    if (currentAllowance < value) {
      throw new BalanceError(
        "The spender does not have enough allowance to spend."
      );
    }

    const transferResp = await this._transfer(ctx, from, to, value);
    if (!transferResp) {
      throw new InternalError("Failed to transfer");
    }

    // Decrease the allowance
    const updatedAllowance = sub(currentAllowance, value);
    const newAllowance = Object.assign({}, allowance[0], {
      value: updatedAllowance,
    });

    await this.allowanceRepository.update(newAllowance);

    // Emit the Transfer event
    const transferEvent = { from, to, value: value };
    ctx.stub.setEvent("Transfer", Buffer.from(JSON.stringify(transferEvent)));

    return true;
  }

  @Transaction()
  async _transfer(
    ctx: FabricContractContext,
    from: string,
    to: string,
    value: number
  ) {
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
    const fromWallet = await this.walletRepository.read(from);

    if (!fromWallet) {
      throw new NotFoundError(`client account ${from} not found`);
    }

    const fromBalance = fromWallet.balance;

    // Check if the sender has enough tokens to spend.
    if (fromBalance < value) {
      throw new BalanceError(`client account ${from} has insufficient funds.`);
    }

    // Retrieve the current balance of the recepient

    const toWallet = await this.walletRepository.read(to);

    if (!toWallet) {
      throw new NotFoundError(`client account ${to} not found`);
    }

    const toBalance = toWallet.balance;

    // Update the balance
    const fromUpdatedBalance = sub(fromBalance, value);
    const toUpdatedBalance = add(toBalance, value);

    const updatedFromWallet = Object.assign({}, fromWallet, {
      balence: fromUpdatedBalance,
    });

    await this.walletRepository.update(updatedFromWallet);

    const updatedToWallet = Object.assign({}, fromWallet, {
      balence: toUpdatedBalance,
    });

    await this.walletRepository.update(updatedToWallet);

    return true;
  }

  /**
   * Allows `spender` to spend `value` amount of tokens from the owner.
   *
   * @param {FabricContractContext} ctx the transaction context
   * @param {String} spender The spender
   * @param {number} value The amount of tokens to be approved for transfer
   * @returns {Boolean} Return whether the approval was successful or not
   */
  @Transaction()
  async Approve(
    ctx: FabricContractContext,
    spender: string,
    value: number
  ): Promise<boolean> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const owner = ctx.identity.getID();

    const ownerWallet = await this.walletRepository.read(owner);

    if (ownerWallet.balance < value) {
      throw new BalanceError(`client account ${owner} has insufficient funds.`);
    }

    const allowance = new Allowance({
      owner: owner,
      spender: spender,
      value: value,
    });

    await this.allowanceRepository.create(allowance);

    // Emit the Approval event
    const approvalEvent = { owner, spender, value: value };
    ctx.stub.setEvent("Approval", Buffer.from(JSON.stringify(approvalEvent)));

    return true;
  }

  /**
   * Returns the amount of tokens which `spender` is allowed to withdraw from `owner`.
   *
   * @param {FabricContractContext} ctx the transaction context
   * @param {String} owner The owner of tokens
   * @param {String} spender The spender who are able to transfer the tokens
   * @returns {number} Return the amount of remaining tokens allowed to spent
   */
  @Transaction()
  async Allowance(
    ctx: FabricContractContext,
    owner: string,
    spender: string
  ): Promise<number> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const allowanceCondition = Condition.and(
      Condition.attribute<Allowance>("owner").eq(owner),
      Condition.attribute<Allowance>("spender").eq(spender)
    );

    const allowance = await this.allowanceRepository
      .select()
      .where(allowanceCondition)
      .execute();

    if (!allowance[0]) {
      throw new BalanceError(
        `spender ${spender} has no allowance from ${owner}`
      );
    }
    return allowance[0].value;
  }

  // ================== Extended Functions ==========================

  /**
   * Set optional infomation for a token.
   *
   * @param {FabricContractContext} ctx the transaction context
   * @param {String} name The name of the token
   * @param {String} symbol The symbol of the token
   * @param {String} decimals The decimals of the token
   * @param {String} totalSupply The totalSupply of the token
   */
  @Transaction()
  async Initialize(
    ctx: FabricContractContext,
    name: string,
    symbol: string,
    decimals: number
  ) {
    // Check contract options are not already set, client is not authorized to change them once intitialized
    const tokens = await this.tokenRepository.select(undefined, ctx).execute();
    if (tokens.length > 0) {
      throw new AuthorizationError(
        "contract options are already set, client is not authorized to change them"
      );
    }

    const token = new ERC20Token({
      name: name,
      owner: ctx.identity.getID(),
      symbol: symbol,
      decimals: decimals,
    });

    await this.tokenRepository.create(token, ctx);

    return true;
  }

  // Checks that contract options have been already initialized
  @Transaction(false)
  async CheckInitialized(ctx: FabricContractContext) {
    const tokens = await this.tokenRepository.select(undefined, ctx).execute();
    if (tokens.length == 0) {
      throw new InternalError(
        "contract options need to be set before calling any function, call Initialize() to initialize contract"
      );
    }
  }

  /**
   * Mint creates new tokens and adds them to minter's account balance
   *
   * @param {FabricContractContext} ctx the transaction context
   * @param {number} amount amount of tokens to be minted
   * @returns {Object} The balance
   */
  @Owner()
  @Transaction()
  async Mint(ctx: FabricContractContext, amount: number): Promise<void> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    // Get ID of submitting client identity
    const minter = ctx.identity.getID();

    if (amount <= 0) {
      throw new ValidationError("mint amount must be a positive integer");
    }

    const minterWallet = await this.walletRepository.read(minter);
    const currentBalance = minterWallet.balance;

    const updatedBalance = add(currentBalance, amount);

    const updatedminter = Object.assign({}, minterWallet, {
      balance: updatedBalance,
    });

    await this.walletRepository.update(updatedminter);

    // Emit the Transfer event
    const transferEvent = { from: "0x0", to: minter, value: amount };
    ctx.stub.setEvent("Transfer", Buffer.from(JSON.stringify(transferEvent)));
  }

  /**
   * Burn redeem tokens from minter's account balance
   *
   * @param {FabricContractContext} ctx the transaction context
   * @param {number} amount amount of tokens to be burned
   * @returns {Object} The balance
   */
  @Owner()
  @Transaction()
  async Burn(ctx: FabricContractContext, amount: number): Promise<void> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const logger = ctx.logger;

    const minter = ctx.identity.getID();

    const minterWallet = await this.walletRepository.read(minter);

    const currentBalance = minterWallet.balance;

    if (currentBalance < amount) {
      throw new BalanceError(`Minter has insufficient funds.`);
    }

    const updatedBalance = sub(currentBalance, amount);

    const updatedminter = Object.assign({}, minterWallet, {
      balance: updatedBalance,
    });

    await this.walletRepository.update(updatedminter);

    logger.info(`${amount} tokens were burned`);

    // Emit the Transfer event
    const transferEvent = { from: minter, to: "0x0", value: amount };
    ctx.stub.setEvent("Transfer", Buffer.from(JSON.stringify(transferEvent)));
  }

  /**
   * BurnFrom redeem tokens from account allowence and balance
   *
   * @param {FabricContractContext} ctx the transaction context
   * @param {number} account account from where tokens will be burned
   * @param {number} amount amount of tokens to be burned
   * @returns {Object} The balance
   */
  @Owner()
  @Transaction()
  async BurnFrom(
    ctx: FabricContractContext,
    account: string,
    amount: number
  ): Promise<void> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    const logger = ctx.logger;

    const accountWallet = await this.walletRepository.read(account);

    const currentBalance = accountWallet.balance;

    if (currentBalance < amount) {
      throw new BalanceError(`${account} has insufficient funds.`);
    }

    const updatedBalance = sub(currentBalance, amount);

    const updatedaccount = Object.assign({}, accountWallet, {
      balance: updatedBalance,
    });

    await this.walletRepository.update(updatedaccount);

    logger.info(`${amount} tokens were berned from ${account}`);

    // Emit the Transfer event
    const transferEvent = { from: account, to: "0x0", value: amount };
    ctx.stub.setEvent("Transfer", Buffer.from(JSON.stringify(transferEvent)));
  }

  /**
   * ClientAccountBalance returns the balance of the requesting client's account.
   *
   * @param {FabricContractContext} ctx the transaction context
   * @returns {Number} Returns the account balance
   */
  @Transaction()
  async ClientAccountBalance(ctx: FabricContractContext): Promise<number> {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    // Get ID of submitting client identity
    const clientAccountID = ctx.identity.getID();

    const clientWallet = await this.walletRepository.read(
      clientAccountID,
      this.repo.class.name,
      ctx
    );

    if (!clientWallet) {
      throw new BalanceError(`The account ${clientAccountID} does not exist`);
    }

    return clientWallet.balance;
  }

  // ClientAccountID returns the id of the requesting client's account.
  // In this implementation, the client account ID is the clientId itself.
  // Users can use this function to get their own account id, which they can then give to others as the payment address
  @Transaction()
  async ClientAccountID(ctx: FabricContractContext) {
    // Check contract options are already set first to execute the function
    await this.CheckInitialized(ctx);

    // Get ID of submitting client identity
    const clientAccountID = ctx.identity.getID();
    return clientAccountID;
  }
}
