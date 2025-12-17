import { Model } from "@decaf-ts/decorator-validation";
import { Info, Object as FabricObject } from "fabric-contract-api";
import { BaseModel } from "@decaf-ts/core";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { Address } from "./Address";

FabricObject()(Model);
FabricObject()(BaseModel);

@Info({
  title: "AddressContract",
  description: "Contract managing the Addresses",
})
export class AddressContract extends SerializedCrudContract<Address> {
  constructor() {
    super(AddressContract.name, Address);
  }
}
