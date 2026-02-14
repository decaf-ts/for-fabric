import {
  AuthorizationError,
  ClientBasedService,
  Context,
  MaybeContextualArg,
  PersistenceKeys,
} from "@decaf-ts/core";
import FabricCAServices, {
  AffiliationService,
  IAttributeRequest,
  IdentityService,
  IEnrollResponse,
  IIdentityRequest,
  IRegisterRequest,
  IRevokeRequest,
  IServiceResponse,
  TLSOptions,
} from "fabric-ca-client";
import { CAConfig, Credentials } from "../../shared/types";
import {
  ConflictError,
  InternalError,
  NotFoundError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { CoreUtils, getAkiAndSerialFromCert } from "../utils";
import {
  CertificateResponse,
  FabricIdentity,
  GetCertificatesRequest,
  IdentityResponse,
} from "../../shared/fabric-types";
import { User } from "fabric-common";
import { RegistrationError } from "../../shared/errors";
import { CA_ROLE } from "./constants";
import { IKeyValueAttribute } from "./FabricEnrollmentService";
import { Identity } from "../../shared/index";
import { CryptoUtils } from "../crypto";

export class FabricIdentityService extends ClientBasedService<
  FabricCAServices,
  CAConfig
> {
  protected _user!: User;

  constructor() {
    super();
  }

  protected get rootClient(): { newCertificateService: any } {
    return (this.client as any)["_FabricCaServices"] as any;
  }

  protected get user(): User {
    if (!this._user)
      throw new InternalError(
        "Fabric identity service not properly setup: missing user"
      );
    return this._user;
  }

  protected get certificates() {
    return this.rootClient.newCertificateService();
  }

  protected get affiliations(): AffiliationService {
    return this.client.newAffiliationService();
  }

  protected get identities(): IdentityService {
    return this.client.newIdentityService();
  }

  protected async getUser(cfg: CAConfig, ctx: Context) {
    const log = ctx.logger.for(this.getUser);
    const { caName, caCert, caKey, url, hsm } = cfg;

    log.info(`Creating CA user for ${caName} at ${url}`);
    log.verbose(`Retrieving CA certificate from ${caCert}`);
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
    this._user = await CoreUtils.getCAUser("admin", key, certificate, caName, {
      hsm,
    });
    return this._user;
  }

  override async initialize(
    ...args: MaybeContextualArg<any>
  ): Promise<{ config: CAConfig; client: FabricCAServices }> {
    const { log, ctx } = (
      await this.logCtx(args, PersistenceKeys.INITIALIZATION, true)
    ).for(this.initialize);
    const [config] = args;
    if (!config) throw new InternalError("Missing Fabric CA configuration");

    const { url, tls, caName } = config;
    log.info(`Initializing CA Client for CA ${config.caName} at ${config.url}`);
    const { trustedRoots, verify } = tls as TLSOptions;

    const root = (trustedRoots as string[])[0] as string;
    log.debug(`Retrieving CA certificate from ${root}. cwd: ${process.cwd()}`);

    const certificate = await CoreUtils.getFileContent(root);

    log.debug(`CA Certificate: ${certificate.toString()}`);

    const client = new FabricCAServices(
      url,
      {
        trustedRoots: Buffer.from(certificate),
        verify,
      } as TLSOptions,
      caName
    );

    const user = await this.getUser(config, ctx);
    log.debug(`CA user loaded: ${user.getName()}`);
    return {
      config,
      client,
    };
  }

  async getCertificates(...args: MaybeContextualArg<any>): Promise<string[]>;
  async getCertificates(
    request: GetCertificatesRequest,
    ...args: MaybeContextualArg<any>
  ): Promise<string[]>;
  async getCertificates<MAP extends boolean>(
    doMap: MAP,
    ...args: MaybeContextualArg<any>
  ): Promise<MAP extends false ? CertificateResponse : string[]>;
  async getCertificates<MAP extends boolean>(
    request: GetCertificatesRequest,
    doMap: MAP,
    ...args: MaybeContextualArg<any>
  ): Promise<MAP extends false ? CertificateResponse : string[]>;
  async getCertificates<MAP extends boolean>(
    request?: GetCertificatesRequest | MAP,
    doMap: MAP = true as MAP,
    ...args: MaybeContextualArg<any>
  ): Promise<MAP extends false ? CertificateResponse : string[]> {
    if (request instanceof Context) {
      args = [request];
      doMap = true as MAP;
      request = undefined;
    } else if (typeof request === "boolean") {
      doMap = request;
      request = undefined;
    } else if (typeof doMap !== "boolean") {
      args = [doMap as MaybeContextualArg<any>, ...args];
      doMap = true as MAP;
    }

    const { log } = (await this.logCtx(args, OperationKeys.READ, true)).for(
      this.getCertificates
    );
    log.debug(
      `Retrieving certificates${request ? ` for ${request.id}` : ""} for CA ${this.config.caName}`
    );
    const response: CertificateResponse = (
      await this.certificates.getCertificates(request || {}, this.user)
    ).result;
    log.verbose(`Found ${response.certs.length} certificates`);
    log.debug(response.certs);
    return (
      doMap ? response.certs.map((c) => c.PEM) : response
    ) as MAP extends false ? CertificateResponse : string[];
  }

  async getIdentities(ctx: Context): Promise<FabricIdentity[]> {
    const log = ctx.logger.for(this.getIdentities);
    log.verbose(`Retrieving Identities under CA ${this.config.caName}`);
    const response: IdentityResponse = (await this.identities.getAll(this.user))
      .result;
    log.verbose(`Found ${response.identities.length} Identities`);
    log.debug(response.identities);
    return response.identities;
  }

  /**
   * @description Retrieve affiliations from the CA.
   * @summary Queries the CA for the list of affiliations available under the configured CA.
   * @return {string} The affiliations result payload.
   */
  async getAffiliations(ctx: Context) {
    const log = ctx.logger.for(this.getAffiliations);
    log.verbose(`Retrieving Affiliations under CA ${this.config.caName}`);
    const response = (await this.affiliations.getAll(this.user)).result;
    log.verbose(`Found ${response.a.length} Affiliations`);
    log.debug(JSON.stringify(response));
    return response;
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
   * @description Read identity details from the CA by enrollment ID.
   * @summary Retrieves and validates a single identity, throwing NotFoundError when missing.
   * @param {string} enrollmentId - Enrollment ID to lookup.
   * @return {Promise<FabricIdentity>} The identity details stored in the CA.
   */
  async read(
    enrollmentId: string,
    ...args: MaybeContextualArg<any>
  ): Promise<FabricIdentity> {
    const { log } = (await this.logCtx(args, OperationKeys.READ, true)).for(
      this.read
    );
    log.verbose(`Retrieving identity with enrollment ID ${enrollmentId}`);
    let result: IServiceResponse;
    try {
      result = await this.identities.getOne(enrollmentId, this.user);
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
    maxEnrollments?: number,
    ...args: MaybeContextualArg<any>
  ): Promise<string> {
    const { log } = (await this.logCtx(args, "register", true)).for(
      this.register
    );

    let registration: string;
    try {
      const { userName, password } = model;
      const props = {
        enrollmentID: userName as string,
        enrollmentSecret: password,
        affiliation: affiliation,
        userRole: userRole,
        attrs: attrs,
        maxEnrollments: maxEnrollments,
      } as IRegisterRequest;
      registration = await this.client.register(props, this.user);
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
    mspId: string,
    ctx: Context
  ): Identity {
    const log = ctx.logger.for(this.identityFromEnrollment);
    const { certificate, key, rootCertificate } = enrollment;
    log.verbose(
      `Generating Identity from certificate ${certificate} in msp ${mspId}`
    );
    const clientId = CryptoUtils.fabricIdFromCertificate(certificate);
    const id = CryptoUtils.encode(clientId);
    log.debug(`Identity ${clientId} and encodedId ${id}`);
    return new Identity({
      id: id,
      credentials: {
        id: id,
        certificate: certificate,
        privateKey: key.toBytes(),
        rootCertificate: rootCertificate,
      },
      mspId: mspId,
    });
  }

  /**
   * @description Enroll an identity with the CA using a registration secret.
   * @summary Exchanges the enrollment ID and secret for certificates, returning a constructed Identity model.
   * @param {string} enrollmentId - Enrollment ID to enroll.
   * @param {string} registration - Enrollment secret returned at registration time.
   * @return {Promise<Identity>} The enrolled identity object with credentials.
   */
  async enroll(
    enrollmentId: string,
    registration: string,
    ...args: MaybeContextualArg<any>
  ): Promise<Identity> {
    const { log, ctx } = (await this.logCtx(args, "enroll", true)).for(
      this.enroll
    );
    let identity: Identity;
    try {
      log.debug(`Enrolling ${enrollmentId}`);
      const enrollment: IEnrollResponse = await this.client.enroll({
        enrollmentID: enrollmentId,
        enrollmentSecret: registration,
      });
      identity = FabricIdentityService.identityFromEnrollment(
        enrollment,
        this.config.caName,
        ctx
      );
      log.info(
        `Successfully enrolled ${enrollmentId} under ${this.config.caName} as ${identity.id}`
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
    maxEnrollments?: number,
    ...args: MaybeContextualArg<any>
  ): Promise<Identity> {
    const { ctx } = (await this.logCtx(args, "register-enroll", true)).for(
      this.registerAndEnroll
    );
    const registration = await this.register(
      model,
      isSuperUser,
      affiliation,
      userRole,
      attrs,
      maxEnrollments,
      ctx
    );
    const { userName } = model;
    return this.enroll(userName as string, registration, ctx);
  }

  /**
   * @description Re-enroll an existing identity using its current enrollment.
   * @summary Renews the enrollment certificate by calling the CA reenroll.
   * @param {User} currentUser - Already enrolled user, must have a signing identity.
   * @return {Promise<Identity>} The renewed identity object with new credentials.
   */
  async updateIdentity(
    enrollmentId: string,
    identity: { certificate: string; privateKey: string },
    identityRequest: IIdentityRequest,
    ...args: MaybeContextualArg<any>
  ): Promise<Identity> {
    const { log, ctx } = (await this.logCtx(args, "reenroll", true)).for(
      this.updateIdentity
    );

    try {
      log.info(`Renewing identity for ${enrollmentId}`);

      // Update attributes in the CA registry (admin operation). This changes the "source of truth".
      const identityService = this.client.newIdentityService();
      // const caIdentityUpdateRequest: IIdentityRequest = {
      //   enrollmentID: enrollmentId,
      //   affiliation: "", // kept as-is to preserve current behavior
      //   attrs: attr,
      // };
      await identityService.update(enrollmentId, identityRequest, this.user); // as IServiceResponse & { result: IIdentityRequest };

      // Reenroll as the user. Request must be signed using the existing certificate.
      const reenrollUser = User.createUser(
        enrollmentId,
        "", // enrollmentSecret not required for reenroll
        this.user.getMspid(),
        identity.certificate,
        identity.privateKey
      );
      reenrollUser.setCryptoSuite(this.user.getCryptoSuite());

      const enrollment = await this.client.reenroll(reenrollUser, []);

      const renewedIdentity = FabricIdentityService.identityFromEnrollment(
        enrollment,
        this.config.caName,
        ctx
      );

      // Revoke the previous certificate only, so the old cert becomes invalid.
      log.debug(`Revoking previous certificates for ${enrollmentId}`);
      const { aki, serial } = getAkiAndSerialFromCert(identity.certificate);
      await this.revoke(enrollmentId, { aki, serial }, args);

      log.debug(`Renew identity successful for ${enrollmentId}`);
      return renewedIdentity;
    } catch (e: any) {
      throw this.parseError(e);
    }
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
  async revoke(
    enrollmentId: string,
    revokeOptions: Omit<IRevokeRequest, "enrollmentID">,
    ...args: MaybeContextualArg<any>
  ): Promise<IServiceResponse> {
    const { log } = (await this.logCtx(args, "revoke", true)).for(this.revoke);
    log.verbose(`Revoking identity with enrollment ID ${enrollmentId}`);
    const identity = await this.read(enrollmentId);
    if (!identity)
      throw new NotFoundError(
        `Could not find enrollment with id ${enrollmentId}`
      );
    let result: IServiceResponse;
    try {
      const reason =
        Boolean(revokeOptions.serial) || Boolean(revokeOptions.aki)
          ? "Revoke User Certificate"
          : "User Deletion";

      const revokeRequest: IRevokeRequest = {
        reason,
        ...revokeOptions,
        enrollmentID: identity.id,
      };

      result = await this.client.revoke(revokeRequest, this.user);
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
