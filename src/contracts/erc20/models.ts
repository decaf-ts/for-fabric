import {
  BaseModel,
  Cascade,
  column,
  oneToMany,
  oneToOne,
  pk,
  table,
} from "@decaf-ts/core";
import { model, type ModelArg, required } from "@decaf-ts/decorator-validation";

/**
 * @description ERC20 token metadata model
 * @summary Represents an ERC20 token definition within the Fabric ERC20 sample, including name, symbol, decimals, and the owning identity. Used to define the unique token managed by the contract.
 * @param {ModelArg<ERC20Token>} [m] - Optional partial data or another instance to initialize the model
 * @return {void}
 * @class ERC20Token
 * @example
 * const token = new ERC20Token({ name: "MyToken", symbol: "MTK", decimals: 18, owner: "x509::..." });
 * // Persist through a repository: await repo.create(token, ctx)
 * @mermaid
 * sequenceDiagram
 *   participant App
 *   participant Repo
 *   participant Adapter
 *   App->>Repo: create(new ERC20Token({...}), ctx)
 *   Repo->>Adapter: create(table, id=name, record, flags)
 *   Adapter-->>Repo: stored
 *   Repo-->>App: model
 */
@table("erc20_tokens")
@model()
export class ERC20Token extends BaseModel {
  @pk({ type: "String" })
  /**
   * @description Token unique name
   * @summary Serves as the primary key for the ERC20 token definition; typically a human-readable identifier
   */
  name!: string;

  @column()
  @required()
  /**
   * @description Owning identity of the token
   * @summary X.509 subject or MSP identity string that denotes who owns/controls the token definition
   */
  owner!: string;
  @column()
  @required()
  /**
   * @description Token symbol
   * @summary Short ticker-like symbol used to represent the token (e.g., MTK)
   */
  symbol!: string;
  @column()
  @required()
  /**
   * @description Decimal precision for token amounts
   * @summary Number of digits after the decimal separator used when formatting token balances
   */
  decimals!: number;

  constructor(m?: ModelArg<ERC20Wallet>) {
    super(m);
  }
}

/**
 * @description ERC20 wallet model
 * @summary Represents a holder account for an ERC20 token within the Fabric network, tracking balance and token association.
 * @param {ModelArg<ERC20Wallet>} [m] - Optional partial data or another instance to initialize the model
 * @return {void}
 * @class ERC20Wallet
 * @example
 * const wallet = new ERC20Wallet({ id: "acct1", token: "MyToken", balance: 1000 });
 * // Update balance via repository: await repo.update(wallet, ctx)
 * @mermaid
 * sequenceDiagram
 *   participant App
 *   participant Repo
 *   App->>Repo: read("acct1", ctx)
 *   Repo-->>App: ERC20Wallet
 */
@table("erc20_wallets")
@model()
export class ERC20Wallet extends BaseModel {
  @pk({ type: "String" })
  /**
   * @description Wallet unique identifier
   * @summary Primary key for the wallet; commonly references an account or identity
   */
  id!: string;

  @column()
  @required()
  @oneToOne(ERC20Token, {
    update: Cascade.CASCADE,
    delete: Cascade.CASCADE,
  })
  /**
   * @description Associated token name
   * @summary References the ERC20Token this wallet holds; maintained as a relationship for cascading updates/deletes
   */
  token!: string;

  @column()
  @required()
  /**
   * @description Token balance for this wallet
   * @summary Current amount of the associated token held by this wallet
   */
  balance!: number;

  @column()
  /**
   * @description Captive flag or identifier
   * @summary Optional field used by some flows to mark non-transferable funds or managed custody
   */
  captive!: string;

  constructor(m?: ModelArg<ERC20Wallet>) {
    super(m);
  }
}

/**
 * @description ERC20 allowance model
 * @summary Captures an approval relationship where an owner allows a spender to transfer up to a certain value from the owner's wallet.
 * @param {ModelArg<Allowance>} [m] - Optional partial data or another instance to initialize the model
 * @return {void}
 * @class Allowance
 * @example
 * const allowance = new Allowance({ owner: "acct1", spender: "acct2", value: 50 });
 * @mermaid
 * sequenceDiagram
 *   participant App
 *   App->>App: new Allowance({ owner, spender, value })
 */
@table("erc20_allowances")
@model()
export class Allowance extends BaseModel {
  @pk({ type: "String" })
  /**
   * @description Allowance unique identifier
   * @summary Primary key for the allowance; typically a unique identifier for the approval relationship
   */
  @column()
  @required()
  @oneToMany(ERC20Wallet, {
    update: Cascade.CASCADE,
    delete: Cascade.CASCADE,
  })
  /**
   * @description Owner wallet identifier
   * @summary Wallet that authorizes the allowance
   */
  owner!: string;

  @column()
  @required()
  @oneToMany(ERC20Wallet, {
    update: Cascade.CASCADE,
    delete: Cascade.CASCADE,
  })
  /**
   * @description Spender wallet identifier
   * @summary Wallet allowed to spend up to the approved value from the owner
   */
  spender!: string;

  @column()
  @required()
  /**
   * @description Approved value
   * @summary Maximum token amount the spender may transfer on behalf of the owner
   */
  value!: number;

  constructor(m?: ModelArg<Allowance>) {
    super(m);
  }
}
