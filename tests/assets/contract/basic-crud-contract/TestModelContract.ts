import { Model } from "@decaf-ts/decorator-validation";
import { TestModel } from "./TestModel";

import { Info, Object as FabricObject } from "fabric-contract-api";
import { BaseModel } from "@decaf-ts/core";
import { FabricCrudContract } from "../../../../src/contracts/crud/crud-contract";

FabricObject()(Model);
FabricObject()(BaseModel);
@Info({
  title: "TestContract",
  description: "Test implementation of crud contract",
})
export class TestModelContract extends FabricCrudContract<TestModel> {
  constructor() {
    super(TestModelContract.name, TestModel);
  }
}
