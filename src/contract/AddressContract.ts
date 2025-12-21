import { Model } from "@decaf-ts/decorator-validation";
import { Info, Object as FabricObject } from "fabric-contract-api";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { Address } from "./Address";
import { FabricBaseModel, FabricIdentifiedBaseModel } from "../shared/index";
//
// FabricObject()(Model);
// FabricObject()(FabricBaseModel);
// FabricObject()(FabricIdentifiedBaseModel);

@Info({
  title: "AddressContract",
  description: "Contract managing the Addresses",
})
export class AddressContract extends SerializedCrudContract<Address> {
  constructor() {
    super(AddressContract.name, Address);
  }
}
