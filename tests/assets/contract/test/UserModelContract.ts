import { SerializedCrudContract } from "../../../../src/index";
import { UserModel } from "../e2e/UserModel";

export class UserModelContract extends SerializedCrudContract<UserModel> {
  constructor() {
    super("UserModelContract", UserModel);
  }
}
