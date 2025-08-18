import { Model } from "@decaf-ts/decorator-validation";
import { TestModel } from "./TestModel";

import { Info, Object as FabricObject } from "fabric-contract-api";
import { BaseModel } from "@decaf-ts/core";
import { SerializedCrudContract } from "../../../../src/contracts/crud/serialized-crud-contract";

FabricObject()(Model);
FabricObject()(BaseModel);

@Info({
  title: "TestContract",
  description: "Test implementation of serialized crud contract",
})
export class TestModelContract extends SerializedCrudContract<TestModel> {
  constructor() {
    super(TestModelContract.name, TestModel);
  }
}
