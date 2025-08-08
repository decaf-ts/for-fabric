import { FabricCrudContract } from "../../../../src/contracts/crud/crud-contract";
import { TestModel } from "./TestModel";

export class TestModelContract extends FabricCrudContract<TestModel> {
  constructor() {
    super(TestModelContract.name, TestModel);
  }
}
