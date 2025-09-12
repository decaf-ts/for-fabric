import { BaseModel, pk } from "@decaf-ts/core";
import { model, type ModelArg, required } from "@decaf-ts/decorator-validation";

/**
 * @description Identity credential model storing cryptographic materials
 * @summary Holds certificate chain and private key information for a Fabric identity, managed as a separate entity linked from Identity
 * @param {ModelArg<IdentityCredentials>} [arg] - Optional initialization object used to populate model fields
 * @class IdentityCredentials
 * @example
 * // Create credentials entry
 * const creds = new IdentityCredentials({ id: "creds1", certificate: "...", rootCertificate: "...", privateKey: "..." });
 * @mermaid
 * sequenceDiagram
 *   participant App
 *   participant Model as IdentityCredentials
 *   App->>Model: new IdentityCredentials({ id, certificate, rootCertificate, privateKey })
 *   Model-->>App: instance
 * @see model
 */
@model()
export class IdentityCredentials extends BaseModel {
  /**
   * @description Unique identifier of the credentials record
   * @summary Primary key for referencing this credentials entry
   */
  @pk()
  id?: string = undefined;

  /**
   * @description PEM-encoded X.509 certificate for the identity
   * @summary Leaf certificate associated with the identity
   */
  @required()
  certificate?: string = undefined;

  /**
   * @description PEM-encoded root or intermediate certificate
   * @summary Root of trust used to validate the leaf certificate
   */
  @required()
  rootCertificate?: string = undefined;

  /**
   * @description PEM-encoded private key material
   * @summary Private key corresponding to the identity certificate
   */
  @required()
  privateKey?: string = undefined;

  constructor(arg?: ModelArg<IdentityCredentials>) {
    super(arg);
  }
}
