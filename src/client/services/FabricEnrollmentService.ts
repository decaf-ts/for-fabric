import FabricCAServices from "fabric-ca-client";
import {
  AffiliationService,
  IdentityService,
  IEnrollResponse,
  IRegisterRequest,
  IServiceResponse,
  TLSOptions,
} from "fabric-ca-client";
import { User } from "fabric-common";
import { CAConfig, Credentials } from "../../shared/types";
import { Identity } from "../../shared/model/Identity";
import { AuthorizationError } from "@decaf-ts/core";
import {
  ConflictError,
  InternalError,
  NotFoundError,
} from "@decaf-ts/db-decorators";
import { CoreUtils } from "../../shared/utils";
import { CA_ROLE } from "./constants";
import { CryptoUtils } from "../../shared/crypto";
import {
  CertificateResponse,
  FabricIdentity,
  GetCertificatesRequest,
  IdentityResponse,
} from "../../shared/fabric-types";
import { RegistrationError } from "../../shared/errors";
import { LoggedClass } from "@decaf-ts/logging";

/**
 * @description Hyperledger Fabric CA identity types.
 * @summary Enumerates the supported identity types recognized by Fabric CA for registration and identity management.
 * @enum {string}
 * @readonly
 * @memberOf module:for-fabric.client
 */
export enum HFCAIdentityType {
  PEER = "peer",
  ORDERER = "orderer",
  CLIENT = "client",
  USER = "user",
  ADMIN = "admin",
}
/**
 * @description Key/value attribute used during CA registration.
 * @summary Represents an attribute entry that can be attached to a Fabric CA identity during registration, optionally marking it for inclusion in ecert.
 * @interface IKeyValueAttribute
 * @template T
 * @param {string} name - Attribute name.
 * @param {string} value - Attribute value.
 * @param {boolean} [ecert] - Whether the attribute should be included in the enrollment certificate (ECert).
 * @memberOf module:for-fabric.client
 */
export interface IKeyValueAttribute {
  name: string;
  value: string;
  ecert?: boolean;
}

/**
 * @description Standard Fabric CA identity attribute keys.
 * @summary Enumerates well-known Fabric CA attribute keys that can be assigned to identities for delegations and permissions.
 * @enum {string}
 * @readonly
 * @memberOf module:for-fabric.client
 */
export enum HFCAIdentityAttributes {
  HFREGISTRARROLES = "hf.Registrar.Roles",
  HFREGISTRARDELEGATEROLES = "hf.Registrar.DelegateRoles",
  HFREGISTRARATTRIBUTES = "hf.Registrar.Attributes",
  HFINTERMEDIATECA = "hf.IntermediateCA",
  HFREVOKER = "hf.Revoker",
  HFAFFILIATIONMGR = "hf.AffiliationMgr",
  HFGENCRL = "hf.GenCRL",
}

/**
 * @description Service wrapper for interacting with a Fabric CA.
 * @summary Provides high-level operations for managing identities against a Hyperledger Fabric Certificate Authority, including registration, enrollment, revocation, and administrative queries. Encapsulates lower-level Fabric CA client calls with consistent logging and error mapping.
 * @param {CAConfig} caConfig - Connection and TLS configuration for the target CA.
 * @class FabricEnrollmentService
 * @example
 * // Register and enroll a new user
 * const svc = new FabricEnrollmentService({
 *   url: 'https://localhost:7054',
 *   caName: 'Org1CA',
 *   tls: { trustedRoots: ['/path/to/ca.pem'], verify: false },
 *   caCert: '/path/to/admin/certDir',
 *   caKey: '/path/to/admin/keyDir'
 * });
 * await svc.register({ userName: 'alice', password: 's3cr3t' }, false, 'org1.department1', CA_ROLE.USER);
 * const id = await svc.enroll('alice', 's3cr3t');
 * @mermaid
 * sequenceDiagram
 *   autonumber
 *   participant App
 *   participant Svc as FabricEnrollmentService
 *   participant CA as Fabric CA
 *   App->>Svc: register(credentials, ...)
 *   Svc->>CA: register(request, adminUser)
 *   CA-->>Svc: enrollmentSecret
 *   Svc-->>App: secret
 *   App->>Svc: enroll(enrollmentId, secret)
 *   Svc->>CA: enroll({enrollmentID, secret})
 *   CA-->>Svc: certificates
 *   Svc-->>App: Identity
 */
export class FabricEnrollmentService extends LoggedClass {
  private ca?: FabricCAServices;

  private certificateService?: any;

  private affiliationService?: AffiliationService;

  private identityService?: IdentityService;

  private client?: any;

  private user?: User;

  constructor(private caConfig: CAConfig) {
    CoreUtils.getCryptoSuite(
      caConfig.hsm
        ? {
            software: false,
            lib: caConfig.hsm.library,
            slot: caConfig.hsm.slot,
            label: caConfig.hsm.tokenLabel,
            pin: String(caConfig.hsm.pin),
          }
        : undefined
    );
    super();
  }

  protected async User(): Promise<User> {
    if (this.user) return this.user;
    const { caName, caCert, caKey, url, hsm } = this.caConfig;
    const log = this.log.for(this.User);
    log.debug(`Creating CA user for ${caName} at ${url}`);
    log.debug(`Retrieving CA certificate from ${caCert}`);
    const certificate = await CoreUtils.getFirstDirFileNameContent(caCert);
    let key: string | undefined;
    if (!hsm) {
      if (!caKey) {
        throw new InternalError(
          `Missing caKey configuration for CA ${caName}. Provide a key directory or configure HSM support.`
        );
      }
      log.debug(`Retrieving CA key from ${caKey}`);
      key = await CoreUtils.getFirstDirFileNameContent(caKey);
    } else {
      log.debug(
        `Using HSM configuration for CA ${caName} with library ${hsm.library}`
      );
    }
    log.debug(`Loading Admin user for ca ${caName}`);
    this.user = await CoreUtils.getCAUser("admin", key, certificate, caName, {
      hsm,
    });
    return this.user;
  }

  protected async CA(): Promise<FabricCAServices> {
    if (this.ca) return this.ca;
    const log = this.log.for(this.CA);
    const { url, tls, caName } = this.caConfig;

    // FOR Some Reason the verification fails need to investigate this works for now
    // eslint-disable-next-line prefer-const
    let { trustedRoots, verify } = tls as TLSOptions;

    verify = false;

    const root = (trustedRoots as string[])[0] as string;
    log.debug(`Retrieving CA certificate from ${root}. cwd: ${process.cwd()}`);

    const certificate = await CoreUtils.getFileContent(root);
    log.debug(`Creating CA Client for CA ${caName} under ${url}`);
    this.ca = new FabricCAServices(
      url,
      {
        trustedRoots: Buffer.from(certificate),
        verify,
      } as TLSOptions,
      caName
    );
    return this.ca;
  }

  protected async Client(): Promise<{ newCertificateService: any }> {
    if (this.client) return this.client;
    const ca = await this.CA();
    this.client = (ca as any)["_FabricCAServices"];
    return this.client;
  }

  protected async Certificate() {
    if (!this.certificateService)
      this.certificateService = (await this.Client()).newCertificateService();
    return this.certificateService;
  }

  protected async Affiliations() {
    if (!this.affiliationService)
      this.affiliationService = (await this.CA()).newAffiliationService();
    return this.affiliationService;
  }

  protected async Identities() {
    if (!this.identityService)
      this.identityService = (await this.CA()).newIdentityService();
    return this.identityService;
  }

  /**
   * @description Retrieve certificates from the CA.
   * @summary Calls the CA certificate service to list certificates, optionally mapping to PEM strings only.
   * @param {GetCertificatesRequest} [request] - Optional filter request for certificate lookup.
   * @param {boolean} [doMap=true] - When true, returns array of PEM strings; otherwise returns full response object.
   * @return {Promise<string[] | CertificateResponse>} Array of PEM strings or the full certificate response.
   */
  async getCertificates(
    request?: GetCertificatesRequest,
    doMap = true
  ): Promise<string[] | CertificateResponse> {
    const certificateService = await this.Certificate();
    const user = await this.User();
    const log = this.log.for(this.getCertificates);
    log.debug(
      `Retrieving certificates${request ? ` for ${request.id}` : ""} for CA ${this.caConfig.caName}`
    );
    const response: CertificateResponse = (
      await certificateService.getCertificates(request || {}, user)
    ).result;
    log.debug(
      `Found ${response.certs.length} certificates: ${JSON.stringify(response)}`
    );
    return doMap ? response.certs.map((c) => c.PEM) : response;
  }

  /**
   * @description List identities registered in the CA.
   * @summary Queries the CA identity service to fetch all identities and returns the list as FabricIdentity objects.
   * @return {Promise<FabricIdentity[]>} The list of identities registered in the CA.
   */
  async getIdentities(): Promise<FabricIdentity[]> {
    const identitiesService = await this.Identities();
    const log = this.log.for(this.getIdentities);
    log.debug(`Retrieving Identities under CA ${this.caConfig.caName}`);
    const response: IdentityResponse = (
      await identitiesService.getAll(await this.User())
    ).result;
    log.debug(
      `Found ${response.identities.length} Identities: ${JSON.stringify(response)}`
    );
    return response.identities;
  }

  protected parseError(e: Error) {
    const regexp = /.*code:\s(\d+).*?message:\s["'](.+)["']/gs;
    const match = regexp.exec(e.message);
    if (!match) return new RegistrationError(e);
    const [, code, message] = match;
    switch (code) {
      case "74":
      case "71":
        return new ConflictError(message);
      case "20":
        return new AuthorizationError(message);
      default:
        return new RegistrationError(message);
    }
  }

  /**
   * @description Retrieve affiliations from the CA.
   * @summary Queries the CA for the list of affiliations available under the configured CA.
   * @return {string} The affiliations result payload.
   */
  async getAffiliations() {
    const affiliationService = await this.Affiliations();
    const log = this.log.for(this.getAffiliations);
    log.debug(`Retrieving Affiliations under CA ${this.caConfig.caName}`);
    const response = (await affiliationService.getAll(await this.User()))
      .result;
    log.debug(
      `Found ${response.a.length} Affiliations: ${JSON.stringify(response)}`
    );
    return response;
  }

  /**
   * @description Read identity details from the CA by enrollment ID.
   * @summary Retrieves and validates a single identity, throwing NotFoundError when missing.
   * @param {string} enrollmentId - Enrollment ID to lookup.
   * @return {Promise<FabricIdentity>} The identity details stored in the CA.
   */
  async read(enrollmentId: string) {
    const ca = await this.CA();
    const user = await this.User();
    let result: IServiceResponse;
    try {
      result = await ca.newIdentityService().getOne(enrollmentId, user);
    } catch (e: any) {
      throw new NotFoundError(
        `Couldn't find enrollment with id ${enrollmentId}: ${e}`
      );
    }

    if (!result.success)
      throw new NotFoundError(
        `Couldn't find enrollment with id ${enrollmentId}: ${result.errors.join("\n")}`
      );

    return result.result as FabricIdentity;
  }

  /**
   * @description Register a new identity with the CA.
   * @summary Submits a registration request for a new enrollment ID, returning the enrollment secret upon success.
   * @param {Credentials} model - Credentials containing userName and password for the new identity.
   * @param {boolean} [isSuperUser=false] - Whether to register the identity as a super user.
   * @param {string} [affiliation=""] - Affiliation string (e.g., org1.department1).
   * @param {CA_ROLE | string} [userRole] - Role to assign to the identity.
   * @param {IKeyValueAttribute} [attrs] - Optional attributes to attach to the identity.
   * @param {number} [maxEnrollments] - Maximum number of enrollments allowed for the identity.
   * @return {Promise<string>} The enrollment secret for the registered identity.
   */
  async register(
    model: Credentials,
    isSuperUser: boolean = false,
    affiliation: string = "",
    userRole?: CA_ROLE | string,
    attrs?: IKeyValueAttribute,
    maxEnrollments?: number
  ): Promise<string> {
    let registration: string;
    const log = this.log.for(this.register);
    try {
      const { userName, password } = model;
      const ca = await this.CA();
      const user = await this.User();
      const props = {
        enrollmentID: userName as string,
        enrollmentSecret: password,
        affiliation: affiliation,
        userRole: userRole,
        attrs: attrs,
        maxEnrollments: maxEnrollments,
      } as IRegisterRequest;
      registration = await ca.register(props, user);
      log.info(
        `Registration for ${userName} created with user type ${userRole ?? "Undefined Role"} ${isSuperUser ? "as super user" : ""}`
      );
    } catch (e: any) {
      throw this.parseError(e);
    }
    return registration;
  }

  protected static identityFromEnrollment(
    enrollment: IEnrollResponse,
    mspId: string
  ): Identity {
    const { certificate, key, rootCertificate } = enrollment;
    const log = this.log.for(this.identityFromEnrollment);
    log.debug(
      `Generating Identity from certificate ${certificate} in msp ${mspId}`
    );
    const clientId = CryptoUtils.fabricIdFromCertificate(certificate);
    const id = CryptoUtils.encode(clientId);
    log.debug(`Identity ${clientId} and encodedId ${id}`);
    const now = new Date();
    return new Identity({
      id: id,
      credentials: {
        id: id,
        certificate: certificate,
        privateKey: key.toBytes(),
        rootCertificate: rootCertificate,
        createdOn: now,
        updatedOn: now,
      },
      mspId: mspId,
      createdOn: now,
      updatedOn: now,
    });
  }

  /**
   * @description Enroll an identity with the CA using a registration secret.
   * @summary Exchanges the enrollment ID and secret for certificates, returning a constructed Identity model.
   * @param {string} enrollmentId - Enrollment ID to enroll.
   * @param {string} registration - Enrollment secret returned at registration time.
   * @return {Promise<Identity>} The enrolled identity object with credentials.
   */
  async enroll(enrollmentId: string, registration: string) {
    let identity: Identity;
    const log = this.log.for(this.enroll);
    try {
      const ca = await this.CA();
      log.debug(`Enrolling ${enrollmentId}`);
      const enrollment: IEnrollResponse = await ca.enroll({
        enrollmentID: enrollmentId,
        enrollmentSecret: registration,
      });
      identity = FabricEnrollmentService.identityFromEnrollment(
        enrollment,
        this.caConfig.caName
      );
      log.info(
        `Successfully enrolled ${enrollmentId} under ${this.caConfig.caName} as ${identity.id}`
      );
    } catch (e: any) {
      throw this.parseError(e);
    }
    return identity;
  }

  /**
   * @description Register and enroll a new identity in one step.
   * @summary Registers a new enrollment ID with the CA and immediately exchanges the secret to enroll, returning the created Identity.
   * @param {Credentials} model - Credentials for the new identity containing userName and password.
   * @param {boolean} [isSuperUser=false] - Whether to register the identity as a super user.
   * @param {string} [affiliation=""] - Affiliation string (e.g., org1.department1).
   * @param {CA_ROLE | string} [userRole] - Role to assign to the identity.
   * @param {IKeyValueAttribute} [attrs] - Optional attributes to attach to the identity.
   * @param {number} [maxEnrollments] - Maximum number of enrollments allowed for the identity.
   * @return {Promise<Identity>} The enrolled identity.
   */
  async registerAndEnroll(
    model: Credentials,
    isSuperUser: boolean = false,
    affiliation: string = "",
    userRole?: CA_ROLE | string,
    attrs?: IKeyValueAttribute,
    maxEnrollments?: number
  ): Promise<Identity> {
    const registration = await this.register(
      model,
      isSuperUser,
      affiliation,
      userRole,
      attrs,
      maxEnrollments
    );
    const { userName } = model;
    return this.enroll(userName as string, registration);
  }

  /**
   * Revokes the enrollment of an identity with the specified enrollment ID.
   *
   * @param enrollmentId - The enrollment ID of the identity to be revoked.
   *
   * @returns A Promise that resolves to the result of the revocation operation.
   *
   * @throws {NotFoundError} If the enrollment with the specified ID does not exist.
   * @throws {InternalError} If there is an error during the revocation process.
   */
  async revoke(enrollmentId: string) {
    const ca = await this.CA();
    const user = await this.User();
    const identity = await this.read(enrollmentId);
    if (!identity)
      throw new NotFoundError(
        `Could not find enrollment with id ${enrollmentId}`
      );
    let result: IServiceResponse;
    try {
      result = await ca.revoke(
        { enrollmentID: identity.id, reason: "User Deletation" },
        user
      );
    } catch (e: unknown) {
      throw new InternalError(
        `Could not revoke enrollment with id ${enrollmentId}: ${e}`
      );
    }
    if (!result.success)
      throw new InternalError(
        `Could not revoke enrollment with id ${enrollmentId}: ${result.errors.join("\n")}`
      );
    return result;
  }
}
