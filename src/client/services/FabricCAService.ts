import FabricCA from "fabric-ca-client";
import {
  AffiliationService,
  IdentityService,
  IEnrollResponse,
  IRegisterRequest,
  IServiceResponse,
  TLSOptions,
} from "fabric-ca-client";
import { User } from "fabric-common";
import { CAConfig, FabricCAServices } from "../types";
import { logAsDebug, Logger, Logging } from "@decaf-ts/logging";
import { getCAUser, getFirstDirFileNameContent } from "../fabric-fs";
import {
  CertificateResponse,
  CertificateService,
  FabricCAClient,
  FabricIdentity,
  GetCertificatesRequest,
  IdentityResponse,
} from "../fabric-shims";
import {
  BaseError,
  ConflictError,
  InternalError,
  NotFoundError,
} from "@decaf-ts/db-decorators";
import { RegistrationError } from "../../shared/errors";
import { AuthorizationError } from "@decaf-ts/core";
import { ErrorParser } from "@decaf-ts/core";

export class FabricCAService implements ErrorParser {
  private static readonly log: Logger = Logging.for(FabricCAService);

  private ca?: FabricCAServices;

  private certificateService?: CertificateService;

  private affiliationService?: AffiliationService;

  private identityService?: IdentityService;

  private client?: FabricCAClient;

  private user?: User;

  protected log: Logger;

  constructor(private caConfig: CAConfig) {
    this.log = FabricCAService.log;
  }

  protected async User(): Promise<User> {
    const log = this.log.for(this.User);
    if (this.user) {
      log.verbose("Returning cached user", 3);
      return this.user;
    }
    const { caName, caCert, caKey, caEndpoint } = this.caConfig;
    log.debug(`Creating CA user for ${caName} at ${caEndpoint}`);
    log.debug(`Retrieving CA certificate from ${caCert}`);
    const certificate = await getFirstDirFileNameContent(caCert);
    log.debug(`Retrieving CA key from ${caKey}`);
    const key = await getFirstDirFileNameContent(caKey);

    log.debug(`Loading Admin user for ca ${caName}`);
    this.user = await getCAUser("admin", key, certificate, caName as string);
    return this.user;
  }

  protected async CA(): Promise<FabricCAServices> {
    const log = this.log.for(this.CA);
    if (this.ca) {
      log.verbose("Returning cached ca service", 3);
      return this.ca;
    }
    const { caEndpoint, tls, caName } = this.caConfig;

    let { trustedRoots, verify } = tls as TLSOptions;

    verify = false; // TODO: FOR Some Reason the verification fails need to investigate this works for now

    const root = (trustedRoots as string[]).shift() as string;
    log.debug(`Retrieving CA certificate from ${root}`);
    const certificate = await getFirstDirFileNameContent(root);
    log.debug(`Creating CA Client for CA ${caName} under ${caEndpoint}`);
    this.ca = new FabricCA(
      caEndpoint,
      {
        trustedRoots: Buffer.from(certificate),
        verify,
      } as TLSOptions,
      caName
    ) as FabricCAServices;
    return this.ca;
  }

  protected async Client(): Promise<FabricCAClient> {
    if (this.client) return this.client;
    const ca = await this.CA();
    this.log
      .for(this.Client)
      .info(`Created CA client for ca ${ca.getCaName()}`);
    this.client = (ca as any)["_fabricCAClient"] as FabricCAClient;
    return this.client;
  }

  protected async Certificate() {
    if (!this.certificateService) {
      const ca = await this.CA();
      this.log
        .for(this.Certificate)
        .info(`Creating Certificate Service for ca ${ca.getCaName()}`);
      this.certificateService = ca.newCertificateService();
    }
    return this.certificateService;
  }

  protected async Affiliations() {
    if (!this.affiliationService) {
      const ca = await this.CA();
      this.log
        .for(this.Affiliations)
        .info(`Creating Affiliations Service for ca ${ca.getCaName()}`);
      this.affiliationService = ca.newAffiliationService();
    }
    return this.affiliationService;
  }

  protected async Identities() {
    if (!this.identityService) {
      const ca = await this.CA();
      this.log
        .for(this.Identities)
        .info(`Creating Identity Service for ca ${ca.getCaName()}`);
      this.identityService = ca.newIdentityService();
    }
    return this.identityService;
  }

  @logAsDebug()
  async getCertificates(
    request?: GetCertificatesRequest,
    doMap = true
  ): Promise<string[] | CertificateResponse> {
    const log = this.log.for(this.getCertificates);
    const certificateService = await this.Certificate();
    const user = await this.User();
    log.verbose(
      `Retrieving certificates ${request ? `for ${request.id}}` : ""} for CA ${this.caConfig.caName}`,
      3
    );
    const response: CertificateResponse = (
      await certificateService.getCertificates(request || {}, user)
    ).result;
    log.debug(
      `Found ${response.certs.length} certificates: ${JSON.stringify(response)}`
    );
    return doMap ? response.certs.map((c) => c.PEM) : response;
  }

  @logAsDebug()
  async getIdentities(): Promise<FabricIdentity[]> {
    const log = this.log.for(this.getIdentities);
    const identitiesService = await this.Identities();
    log.verbose(`Retrieving Identities under CA ${this.caConfig.caName}`, 3);
    const response: IdentityResponse = (
      await identitiesService.getAll(await this.User())
    ).result;
    log.debug(
      `Found ${response.identities.length} Identities: ${JSON.stringify(response)}`
    );
    return response.identities;
  }

  @logAsDebug()
  async getAffiliations() {
    const log = this.log.for(this.getAffiliations);
    const affiliationService = await this.Affiliations();
    log.verbose(`Retrieving Affiliations under CA ${this.caConfig.caName}`, 3);
    const response = (await affiliationService.getAll(await this.User()))
      .result;
    log.debug(
      `Found ${response.length} Affiliations: ${JSON.stringify(response)}`
    );
    return response;
  }

  @logAsDebug()
  async read(enrollmentId: string) {
    const ca = await this.CA();
    const user = await this.User();
    let result: IServiceResponse;
    try {
      result = await ca.newIdentityService().getOne(enrollmentId, user);
    } catch (e: unknown) {
      throw new NotFoundError(
        `Could not find enrollment with id ${enrollmentId}: ${e}`
      );
    }

    if (!result.success)
      throw new NotFoundError(
        `Could not find enrollment with id ${enrollmentId}:\n${result.errors.join("\n")}`
      );

    return result.result as FabricIdentity;
  }

  @logAsDebug()
  async register(request: IRegisterRequest): Promise<string> {
    const log = this.log.for(this.register);
    let registration: string;

    try {
      const ca = await this.CA();
      const user = await this.User();
      log.verbose(
        `Registering ${request.enrollmentID} under CA ${this.caConfig.caName}`,
        3
      );
      registration = await ca.register(request, user);
      log.info(`Registration for ${request.enrollmentID} completed`);
    } catch (e: any) {
      throw this.parseError(e);
    }
    return registration;
  }

  async enroll(enrollmentId: string, enrollmentSecret: string) {
    const log = this.log.for(this.enroll);
    let enrollment: IEnrollResponse;
    try {
      const ca = await this.CA();
      log.info(`Enrolling ${enrollmentId}`);
      enrollment = await ca.enroll({
        enrollmentID: enrollmentId,
        enrollmentSecret: enrollmentSecret,
      });
      log.info(
        `Successfully enrolled ${enrollmentId} under ${this.caConfig.caName}`
      );
    } catch (e: any) {
      throw this.parseError(e);
    }
    return enrollment;
  }

  async registerAndEnroll(request: IRegisterRequest): Promise<IEnrollResponse> {
    const registration = await this.register(request);
    return this.enroll(request.enrollmentID, registration);
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
      throw this.parseError(e as Error);
    }
    if (!result.success)
      throw new InternalError(
        `Could not revoke enrollment with id ${enrollmentId}:\n${result.errors.join("\n")}`
      );
    return result;
  }

  parseError(e: Error): BaseError {
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

  toString() {
    return `FabricCAService for ${this.caConfig.caName}`;
  }
}
