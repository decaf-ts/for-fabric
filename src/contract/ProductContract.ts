import { Model } from "@decaf-ts/decorator-validation";
import { Info, Object as FabricObject } from "fabric-contract-api";
import { BaseModel } from "@decaf-ts/core";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { Product } from "./Product";
//
// FabricObject()(Model);
// FabricObject()(BaseModel);

@Info({
  title: "ProductContract",
  description: "Contract managing the Products",
})
export class ProductContract extends SerializedCrudContract<Product> {
  constructor() {
    super(ProductContract.name, Product);
  }
}
