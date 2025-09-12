import { BaseModel, Cascade, oneToOne, pk } from "@decaf-ts/core";
import { model, type ModelArg, required } from "@decaf-ts/decorator-validation";
import { IdentityCredentials } from "./IdentityCredentials";
import { IdentityType } from "../constants";

/**
 * @description Identity model representing a Fabric wallet entry
 * @summary Encapsulates an identity stored in a Fabric wallet, including its MSP identifier, credential linkage, and type information. Built on BaseModel for integration with Decaf validation and persistence.
 * @param {ModelArg<Identity>} [arg] - Optional initialization object used to populate model fields
 * @class Identity
 * @example
 * // Create a new identity referencing existing credentials
 * const id = new Identity({ id: "user1", mspId: "Org1MSP", type: IdentityType.X509 });
 * @mermaid
 * sequenceDiagram
 *   participant App
 *   participant Model as Identity
 *   App->>Model: new Identity({ id, mspId, type })
 *   Model-->>App: instance
 */
@model()
export class Identity extends BaseModel {
  /**
   * @description Unique identifier of the identity in the wallet
   * @summary Primary key used to reference this identity record
   */
  @pk()
  id?: string = undefined;

  /**
   * @description Link to the identity credentials stored separately
   * @summary One-to-one relationship to the credentials entity; cascades on update and delete
   */
  @oneToOne(IdentityCredentials, {
    update: Cascade.CASCADE,
    delete: Cascade.CASCADE,
  })
  credentials?: IdentityCredentials = undefined;

  /**
   * @description Membership Service Provider identifier
   * @summary The MSP ID corresponding to the organization that issued this identity
   */
  @required()
  mspId?: string = undefined;

  /**
   * @description Type of identity
   * @summary Indicates the identity encoding/format; defaults to X.509
   */
  @required()
  type?: IdentityType = IdentityType.X509;

  constructor(arg: ModelArg<Identity>) {
    super(arg);
  }
}
