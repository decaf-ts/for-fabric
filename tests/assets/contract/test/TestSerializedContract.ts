import { Model } from "@decaf-ts/decorator-validation";
import { FabricCrudContract } from "../../../../src/contracts/crud/crud-contract";
import { TestModel } from "./TestModel";
import { FabricObject } from "../../../../src/shared/fabric-shims";
import { Info } from "fabric-contract-api";
import { BaseModel } from "@decaf-ts/core";
import { SerializedCrudContract } from "../../../../src/contracts/crud/serialized-crud-contract";

FabricObject(Model);
FabricObject(BaseModel);
FabricObject(TestModel);
@Info({
  title: "TestContract",
  description: "Test implementation of crud contract",
})
export class TestSerializedContract extends SerializedCrudContract<TestModel> {
  constructor() {
    super(TestSerializedContract.name, TestModel);
  }
}
