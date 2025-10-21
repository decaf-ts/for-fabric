import { FabricCrudContract } from "../../../../src/contracts/crud/crud-contract";

console.log(
  "Forcing Fabric Crud Contract before models to trigger adaptor decorators override:",
  FabricCrudContract
);
import { Model } from "@decaf-ts/decorator-validation";
import { Info, Object as FabricObject } from "fabric-contract-api";
import { BaseModel } from "@decaf-ts/core";
import { FabricERC20Contract } from "../../../../src/contracts/erc20/erc20contract";

FabricObject()(Model);
FabricObject()(BaseModel);

@Info({
  title: "TestContractPublicModel",
  description: "Test implementation of serialized crud contract",
})
export class TestERC20Contract extends FabricERC20Contract {
  constructor() {
    super(TestERC20Contract.name);
  }
}
