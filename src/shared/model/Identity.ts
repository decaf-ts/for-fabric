import { BaseModel, Cascade, oneToOne, pk } from "@decaf-ts/core";
import { model, type ModelArg, required } from "@decaf-ts/decorator-validation";
import { IdentityType } from "../../contracts";
import { IdentityCredentials } from "./IdentityCredentials";

/**
 * @summary Identity Class
 * @description Used to store Fabric Identities in the wallet
 *
 * @param {ModelArg} [arg]
 *
 * @class Identity
 * @extends BaseModel
 *
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
