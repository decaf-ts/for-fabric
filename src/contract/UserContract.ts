import { Model } from "@decaf-ts/decorator-validation";
import { Info, Object as FabricObject } from "fabric-contract-api";
import { BaseModel } from "@decaf-ts/core";
import { SerializedCrudContract } from "../contracts/crud/serialized-crud-contract";
import { User } from "./User";

FabricObject()(Model);
FabricObject()(BaseModel);

@Info({
  title: "UserContract",
  description: "Contract managing the users",
})
export class UserContract extends SerializedCrudContract<User> {
  constructor() {
    super(UserContract.name, User);
  }
}
