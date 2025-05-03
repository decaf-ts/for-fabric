import { User } from "fabric-common";
import {
  AffiliationService,
  IAttributeRequest,
  ICAInfoResponse,
  IdentityService,
  IEnrollResponse,
  IKeyValueAttribute,
} from "fabric-ca-client";
import { SigningIdentity } from "@hyperledger/fabric-gateway/dist/signingidentity";

/**
 * @typedef {Object} GetCertificatesRequest
 * @property {string} id The enrollment ID that uniquely identifies an identity
 * @property {string} aki Authority Key Identifier string, hex encoded, for the specific certificate
 * @property {string} serial The serial number for a certificate
 * @property {string} revoked_start Get revoked certificates starting at the specified time,
 * either as timestamp (RFC3339 format) or duration (-30d)
 * @property {string} revoked_end Get revoked certificates before the specified time, either as timestamp
 * (RFC3339 format) or duration (-15d)
 * @property {string} expired_start Get expired certificates starting at the specified time,
 * either as timestamp (RFC3339 format) or duration (-30d)
 * @property {string} expired_end Get expired certificates before the specified time, either
 * as timestamp (RFC3339 format) or duration (-15d)
 * @property {boolean} notexpired Don't return expired certificates
 * @property {boolean} notrevoked Don't return revoked certificates
 * @property {string} ca The name of the CA to direct this request to within the server,
 * or the default CA if not specified
 */
export interface GetCertificatesRequest {
  id?: string;
  aki?: string;
  serial?: string;
  revoked_start?: string;
  revoked_end?: string;
  expired_start?: string;
  expired_end?: string;
  notrevoked?: boolean;
  notexpired?: boolean;
  ca?: string;
}

export interface CertificateResponse {
  caname: string;
  certs: { PEM: string }[];
}

export interface FabricIdentity {
  id: string;
  type: string;
  affiliation: string;
  attrs: { name: string; value: string }[];
  max_enrollments: number;
}

export type IdentityResponse = {
  caname: string;
  identities: FabricIdentity[];
};

export interface CertificateService {
  /**
   * The caller will be able to view certificates that it owns. In addition,
   * if the caller has **hf.Registrar.Roles** or **hf.Revoker** attribute,
   * it will be able to view certificates for identities that have affiliations
   * equal to or below the caller's affiliation.
   *
   * @param {GetCertificatesRequest} request the request filter
   * @param {User} registrar The identity of the registrar (i.e. who is performing the revocation)
   * signing certificate, hash algorithm and signature algorithm
   */
  getCertificates(
    request: GetCertificatesRequest,
    registrar: User
  ): Promise<any>;
}

export interface FabricCAClient {
  /**
   * Register a new user and return the enrollment secret
   * @param {string} enrollmentID ID which will be used for enrollment
   * @param {string | null} [enrollmentSecret] Optional enrollment secret to set for the registered user.
   *        If not provided, the server will generate one.
   *        When not including, use a null for this parameter.
   * @param {string | null} [role] Optional type of role for this user.
   *        When not including, use a null for this parameter.
   * @param {string} affiliation Affiliation with which this user will be associated
   * @param {number} maxEnrollments The maximum number of times the user is permitted to enroll
   * @param {IKeyValueAttribute[]} [attrs=[]] Array of key/value attributes to assign to the user
   * @param {SigningIdentity} signingIdentity The instance of a SigningIdentity encapsulating the
   * signing certificate, hash algorithm and signature algorithm
   * @returns {Promise<string>} The enrollment secret to use when this user enrolls
   */
  register(
    enrollmentID: string,
    enrollmentSecret: string | null,
    role: string | null,
    affiliation: string,
    maxEnrollments: number,
    attrs: IKeyValueAttribute[],
    signingIdentity: SigningIdentity
  ): Promise<string>;

  /**
   * Revoke an existing certificate (enrollment certificate or transaction certificate), or revoke
   * all certificates issued to an enrollment id. If revoking a particular certificate, then both
   * the Authority Key Identifier and serial number are required. If revoking by enrollment id,
   * then all future requests to enroll this id will be rejected.
   * @param {string} enrollmentID ID to revoke
   * @param {string} aki Authority Key Identifier string, hex encoded, for the specific certificate to revoke
   * @param {string} serial Serial number string, hex encoded, for the specific certificate to revoke
   * @param {string} reason The reason for revocation. See https://godoc.org/golang.org/x/crypto/ocsp
   *  for valid values
   * @param {boolean} gencrl GenCRL specifies whether to generate a CRL
   * @param {SigningIdentity} signingIdentity The instance of a SigningIdentity encapsulating the
   * signing certificate, hash algorithm and signature algorithm
   * @returns {Promise} The revocation results
   */
  revoke(
    enrollmentID: string,
    aki: string,
    serial: string,
    reason: string,
    gencrl: boolean,
    signingIdentity: SigningIdentity
  ): Promise<any>;

  /**
   * Re-enroll an existing user.
   * @param {string} csr PEM-encoded PKCS#10 certificate signing request
   * @param {SigningIdentity} signingIdentity The instance of a SigningIdentity encapsulating the
   * signing certificate, hash algorithm and signature algorithm
   * @param {IAttributeRequest[]} [attr_reqs] An array of {@link IAttributeRequest}
   * @returns {Promise<IEnrollResponse>}
   */
  reenroll(
    csr: string,
    signingIdentity: SigningIdentity,
    attr_reqs?: IAttributeRequest[]
  ): Promise<IEnrollResponse>;

  /**
   * Creates a new {@link IdentityService} instance
   *
   * @returns {IdentityService} instance
   */
  newIdentityService(): IdentityService;

  /**
   * Create a new {@link AffiliationService} instance
   *
   * @returns {AffiliationService} instance
   */
  newAffiliationService(): AffiliationService;
  /**
   * Create a new {@link CertificateService} instance
   *
   * @returns {CertificateService} instance
   */
  newCertificateService(): CertificateService;

  /**
   * Get info on the CA
   * @param {SigningIdentity} signingIdentity The instance of a SigningIdentity encapsulating the
   * signing certificate, hash algorithm and signature algorithm
   * @returns {Promise<ICAInfoResponse>}
   */
  getCaInfo(signingIdentity: SigningIdentity): Promise<ICAInfoResponse>;

  /*
   * Generate authorization token required for accessing fabric-ca APIs
   */
  generateAuthToken(
    reqBody: Record<string, unknown>,
    signingIdentity: SigningIdentity,
    path: string,
    method: "POST" | "GET" | "PUT" | "DELETE"
  ): Promise<string>;

  post(
    api_method: string,
    requestObj: Record<string, unknown>,
    signingIdentity: SigningIdentity
  ): Promise<string>;

  get(api_method: string, signingIdentity: SigningIdentity): Promise<string>;

  put(
    api_method: string,
    requestObj: Record<string, unknown>,
    signingIdentity: SigningIdentity
  ): Promise<string>;

  delete(api_method: string, signingIdentity: SigningIdentity): Promise<string>;

  request(
    http_method: "POST" | "GET" | "PUT" | "DELETE",
    api_method: string,
    signingIdentity: SigningIdentity,
    requestObj: Record<string, unknown>,
    extraRequestOptions?: Record<string, unknown>
  ): Promise<string>;

  /**
   * Enroll a registered user in order to receive a signed X509 certificate
   * @param {string} enrollmentID The registered ID to use for enrollment
   * @param {string} enrollmentSecret The secret associated with the enrollment ID
   * @param {string} csr PEM-encoded PKCS#10 certificate signing request
   * @param {string} [profile] The profile name.  Specify the 'tls' profile for a TLS certificate; otherwise, an enrollment certificate is issued.
   * @param {IAttributeRequest[]} [attr_reqs] An array of {@link IAttributeRequest}
   * @returns {Promise<IEnrollResponse>}
   */
  enroll(
    enrollmentID: string,
    enrollmentSecret: string,
    csr: string,
    profile: string,
    attr_reqs: IAttributeRequest[]
  ): Promise<IEnrollResponse>;
}
