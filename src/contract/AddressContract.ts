import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { Address } from "./Address";
import { Info } from "fabric-contract-api";
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
