import { Info } from "fabric-contract-api";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { ProductStrength } from "./models/ProductStrength";

@Info({
  title: "ProductStrengthContract",
  description: "Contract managing the Product Strengths",
})
export class ProductStrengthContract extends SerializedCrudContract<ProductStrength> {
  constructor() {
    super(ProductStrengthContract.name, ProductStrength);
  }
}
