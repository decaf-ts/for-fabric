import { FabricCrudContract } from "../../../../src/contracts/crud/crud-contract";

console.log(
  "Forcing Fabric Crud Contract before models to trigger adaptor decorators override:",
  FabricCrudContract
);
import { Info } from "fabric-contract-api";
import { SerializedCrudContract } from "../../../../src/contracts/crud/serialized-crud-contract";
import { Product } from "./Product";

@Info({
  title: "TestContractPublicModel",
  description: "Test implementation of serialized crud contract",
})
export class ProductContract extends SerializedCrudContract<Product> {
  constructor() {
    super(ProductContract.name, Product);
  }
}
