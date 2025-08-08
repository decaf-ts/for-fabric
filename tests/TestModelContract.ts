import { FabricCrudContract } from "../src/contracts/crud/crud-contract";
import { FabricERC20Contract } from "../src/contracts/erc20/erc20contract";
import { TestModel } from "./TestModel";

export class TestModelContract extends FabricCrudContract<TestModel> {
  constructor() {
    super(TestModelContract.name, TestModel);
  }
}

export class TestERC20Contract extends FabricERC20Contract {
  constructor() {
    super("TestERC20");
  }
}
