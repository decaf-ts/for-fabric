import { Model} from "@decaf-ts/decorator-validation"
import { FabricCrudContract } from "../../../../src/contracts/crud/crud-contract";
import { TestModel } from "./TestModel";
import { FabricObject } from "../../../../src/shared/fabric-shims"
import {Info} from "fabric-contract-api";
import { BaseModel } from "@decaf-ts/core";

FabricObject(Model)
FabricObject(BaseModel)
FabricObject(TestModel)
@Info({title: 'TestContract', description: 'Test implementation of crud contract'})
export class TestModelContract extends FabricCrudContract<TestModel> {
  constructor() {
    super(TestModelContract.name, TestModel);
  }
}
