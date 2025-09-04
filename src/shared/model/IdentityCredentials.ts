import { BaseModel, pk } from "@decaf-ts/core";
import { model, type ModelArg, required } from "@decaf-ts/decorator-validation";

/**
 * @summary Identity Credential Class
 * @description Used to store Fabric Identities Credentials in the wallet
 *
 * @param {ModelArg} [arg]
 *
 * @class IdentityCredentials
 * @extends BaseModel
 *
 * @category Model
 * @see model
 */
@model()
export class IdentityCredentials extends BaseModel {
  @pk()
  id?: string = undefined;

  @required()
  certificate?: string = undefined;

  @required()
  rootCertificate?: string = undefined;

  @required()
  privateKey?: string = undefined;

  constructor(arg?: ModelArg<IdentityCredentials>) {
    super(arg);
  }
}
