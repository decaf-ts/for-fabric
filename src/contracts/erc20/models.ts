import { BaseModel, Cascade, oneToMany, pk } from "@decaf-ts/core";
import { model, type ModelArg, required } from "@decaf-ts/decorator-validation";

@model()
export class ERC20Token extends BaseModel {
  @pk()
  name!: string;

  @required()
  owner!: string;

  @required()
  symbol!: string;

  @required()
  decimals!: number;

  constructor(m?: ModelArg<ERC20Wallet>) {
    super(m);
  }
}

@model()
export class ERC20Wallet extends BaseModel {
  @pk()
  id!: string;

  @required()
  @oneToMany(ERC20Token, {
    update: Cascade.CASCADE,
    delete: Cascade.CASCADE,
  })
  token!: string;

  @required()
  balance!: number;

  captive!: string;

  constructor(m?: ModelArg<ERC20Wallet>) {
    super(m);
  }
}

export class Allowance extends BaseModel {
  @required()
  owner!: string;

  @required()
  @oneToMany(ERC20Wallet, {
    update: Cascade.CASCADE,
    delete: Cascade.CASCADE,
  })
  spender!: string;

  @required()
  @oneToMany(ERC20Wallet, {
    update: Cascade.CASCADE,
    delete: Cascade.CASCADE,
  })
  value!: number;

  constructor(m?: ModelArg<Allowance>) {
    super(m);
  }
}
