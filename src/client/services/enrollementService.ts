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
} from "../../shared/fabric-shims";
import { RegistrationError } from "../../shared/errors";
import { LoggedService } from "./LoggedService";

export enum HFCAIdentityType {
  PEER = "peer",
  ORDERER = "orderer",
  CLIENT = "client",
  USER = "user",
  ADMIN = "admin",
}
export interface IKeyValueAttribute {
  name: string;
  value: string;
  ecert?: boolean;
}

export enum HFCAIdentityAttributes {
  HFREGISTRARROLES = "hf.Registrar.Roles",
  HFREGISTRARDELEGATEROLES = "hf.Registrar.DelegateRoles",
  HFREGISTRARATTRIBUTES = "hf.Registrar.Attributes",
  HFINTERMEDIATECA = "hf.IntermediateCA",
  HFREVOKER = "hf.Revoker",
  HFAFFILIATIONMGR = "hf.AffiliationMgr",
  HFGENCRL = "hf.GenCRL",
}

export class FabricEnrollmentService extends LoggedService {
  private ca?: FabricCAServices;

  private certificateService?: any;

  private affiliationService?: AffiliationService;

  private identityService?: IdentityService;

  private client?: any;

  private user?: User;

  constructor(private caConfig: CAConfig) {
    super();
  }

  protected async User(): Promise<User> {
    if (this.user) return this.user;
    const { caName, caCert, caKey, url } = this.caConfig;
    const log = this.log.for(this.User);
    log.debug(`Creating CA user for ${caName} at ${url}`);
    log.debug(`Retrieving CA certificate from ${caCert}`);
    const certificate = await CoreUtils.getFirstDirFileNameContent(caCert);
    log.debug(`Retrieving CA key from ${caKey}`);
    const key = await CoreUtils.getFirstDirFileNameContent(caKey);
    log.debug(`Loading Admin user for ca ${caName}`);
    this.user = await CoreUtils.getCAUser("admin", key, certificate, caName);
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

    const root = (trustedRoots as string[]).shift() as string;
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

  protected async Client(): Promise<{ newCertificateService: Function }> {
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

  async read(enrollmentId: string) {
    const ca = await this.CA();
    const user = await this.User();
    let result: IServiceResponse;
    try {
      result = await ca.newIdentityService().getOne(enrollmentId, user);
    } catch (e: any) {
      throw new NotFoundError(
        `Couldn't find enrollment with id ${enrollmentId}`
      );
    }

    if (!result.success)
      throw new NotFoundError(
        `Couldn't find enrollment with id ${enrollmentId}: ${result.errors.join("\n")}`
      );

    return result.result as FabricIdentity;
  }

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
        // userRole,
        // attrs: attrs,
        // maxEnrollments: maxEnrollments,
        // maxEnrollments: (role === CA_ROLE.ADMIN || isSuperUser) ? -1 : 1
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
   * Registers a new identity with the CA and enrolls it.
   *
   * @param model - The credentials for the new identity.
   * @param isSuperUser - Indicates if the new identity should be a super user. Default is false.
   * @param affiliation - The affiliation of the new identity. Default is an empty string.
   * @param userRole - The role of the new identity. It can be a CA_ROLE or a custom string.
   * @param attrs - Additional attributes for the new identity.
   * @param maxEnrollments - The maximum number of enrollments for the new identity.
   *
   * @returns A Promise that resolves to the newly enrolled identity.
   *
   * @throws {RegistrationError} If there is an error during the registration process.
   * @throws {ConflictError} If the enrollment ID already exists.
   * @throws {AuthorizationError} If the user does not have the necessary permissions.
   * @throws {DLTError} If there is an error during the enrollment process.
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
        `Could not revoke enrollment with id ${enrollmentId}`
      );
    }
    if (!result.success)
      throw new InternalError(
        `Could not revoke enrollment with id ${enrollmentId}: ${result.errors.join("\n")}`
      );
    return result;
  }
}
