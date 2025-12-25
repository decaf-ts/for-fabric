import { Info } from "fabric-contract-api";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { Product } from "./models/Product";

@Info({
  title: "ProductContract",
  description: "Contract managing the Products",
})
export class ProductContract extends SerializedCrudContract<Product> {
  constructor() {
    super(ProductContract.name, Product);
  }
}
