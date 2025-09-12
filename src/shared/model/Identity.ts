import { BaseModel, Cascade, oneToOne, pk } from "@decaf-ts/core";
import { model, type ModelArg, required } from "@decaf-ts/decorator-validation";
import { IdentityCredentials } from "./IdentityCredentials";
import { IdentityType } from "../constants";

/**
 * @description Identity Class
 * @summary Represents a Hyperledger Fabric identity stored in the wallet, including its MSP identifier and credential reference.
 * @param {ModelArg<Identity>} [arg] - Optional initialization object used by BaseModel to populate fields
 * @class Identity
 * @category Model
 * @see model
 */
@model()
export class Identity extends BaseModel {
  @pk()
  id?: string = undefined;

  @oneToOne(IdentityCredentials, {
    update: Cascade.CASCADE,
    delete: Cascade.CASCADE,
  })
  credentials?: IdentityCredentials = undefined;

  @required()
  mspId?: string = undefined;

  @required()
  type?: IdentityType = IdentityType.X509;

  constructor(arg: ModelArg<Identity>) {
    super(arg);
  }
}
