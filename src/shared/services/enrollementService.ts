import FabricCAClient from "fabric-ca-client";
import {
  AffiliationService,
  IdentityService,
  IEnrollResponse,
  IRegisterRequest,
  IServiceResponse,
  TLSOptions,
} from "fabric-ca-client";
import { User } from "fabric-common";
import { CAConfig, Credentials } from "../types";
import { Identity } from "../../shared/model/Identity";
import { stringFormat } from "@decaf-ts/decorator-validation";
import { Logger, Logging, MiniLogger } from "@decaf-ts/logging";
import { AuthorizationError } from "@decaf-ts/core";
import { ConflictError, NotFoundError } from "@decaf-ts/db-decorators";
import { DLTError, RegistrationError } from "../errors";
import { CoreUtils } from "../utils";
import { CA_ROLE } from "./constants";
import { CryptoUtils } from "../crypto";
import {
  CertificateResponse,
  FabricIdentity,
  GetCertificatesRequest,
  IdentityResponse,
} from "../fabric-shims";

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

export class FabricEnrollmentService {
  private ca?: FabricCAClient;

  private certificateService?: any;

  private affiliationService?: AffiliationService;

  private identityService?: IdentityService;

  private client?: any;

  private user?: User;

  constructor(private caConfig: CAConfig) {}

  protected get logger(): Logger {
    return this.logger
      ? this.logger
      : new MiniLogger(FabricEnrollmentService.name);
  }

  protected async User(): Promise<User> {
    if (this.user) return this.user;
    const { caName, caCert, caKey, url } = this.caConfig;
    this.logger.debug(
      stringFormat("Creating CA user for {0} at {1}", caName, url)
    );
    this.logger.debug(
      stringFormat("Retrieving CA certificate from {0}", caCert)
    );
    const certificate = await CoreUtils.getFirstDirFileNameContent(caCert);
    this.logger.debug(stringFormat("Retrieving CA key from {0}", caKey));
    const key = await CoreUtils.getFirstDirFileNameContent(caKey);

    this.logger.debug(stringFormat("Loading Admin user for ca {0}", caName));
    this.user = await CoreUtils.getCAUser("admin", key, certificate, caName);
    return this.user;
  }

  protected async CA(): Promise<FabricCAClient> {
    if (this.ca) return this.ca;
    const { url, tls, caName } = this.caConfig;

    // FOR Some Reason the verification fails need to investigate this works for now
    // eslint-disable-next-line prefer-const
    let { trustedRoots, verify } = tls as TLSOptions;

    verify = false;

    const root = (trustedRoots as string[]).shift() as string;
    this.logger.debug(stringFormat("Retrieving CA certificate from {0}", root));
    const certificate = await CoreUtils.getFirstDirFileNameContent(root);
    this.logger.debug(
      stringFormat("Creating CA Client for CA {0} under {1}", caName, url)
    );
    this.ca = new FabricCAClient(
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
    this.client = (ca as any)["_fabricCAClient"];
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
    this.logger.debug(
      stringFormat(
        "Retrieving certificates {0} for CA {1}",
        request ? stringFormat("for {0}", request.id as string) : "",
        this.caConfig.caName
      )
    );
    const response: CertificateResponse = (
      await certificateService.getCertificates(request || {}, user)
    ).result;
    this.logger.debug(
      stringFormat(
        "Found {0} certificates: {1}",
        response.certs.length + "",
        JSON.stringify(response)
      )
    );
    return doMap ? response.certs.map((c) => c.PEM) : response;
  }

  async getIdentities(): Promise<FabricIdentity[]> {
    const identitiesService = await this.Identities();
    this.logger.debug(
      stringFormat("Retrieving Identities under CA {0}", this.caConfig.caName)
    );
    const response: IdentityResponse = (
      await identitiesService.getAll(await this.User())
    ).result;
    this.logger.debug(
      stringFormat(
        "Found {0} Identities: {1}",
        response.identities.length + "",
        JSON.stringify(response)
      )
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
    this.logger.debug(
      stringFormat("Retrieving Affiliations under CA {0}", this.caConfig.caName)
    );
    const response = (await affiliationService.getAll(await this.User()))
      .result;
    this.logger.debug(
      stringFormat(
        "Found {0} Affiliations: {1}",
        response.a.length + "",
        JSON.stringify(response)
      )
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
        stringFormat("Could not find enrollment with id {0}", enrollmentId)
      );
    }

    if (!result.success)
      throw new NotFoundError(
        stringFormat(
          "Could not find enrollment with id {0}:\n{1}",
          enrollmentId,
          result.errors.join("\n")
        )
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

    try {
      const { userName, password } = model;
      const ca = await this.CA();
      const user = await this.User();
      const props = {
        enrollmentID: userName as string,
        enrollmentSecret: password,
        affiliation: affiliation,
        userRole,
        attrs: attrs,
        maxEnrollments: maxEnrollments,
        // maxEnrollments: (role === CA_ROLE.ADMIN || isSuperUser) ? -1 : 1
      } as IRegisterRequest;
      registration = await ca.register(props, user);
      this.logger.info(
        stringFormat(
          `Registration for {0} created with user type {1} ${isSuperUser ? "as super user" : ""} `,
          model.userName as string,
          userRole ?? "Undefined Role"
        )
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
    const logger = Logging.for(FabricEnrollmentService);
    logger.debug(
      stringFormat(
        "Generating Identity from certificate {0} in msp {1}",
        certificate,
        mspId
      )
    );
    const clientId = CryptoUtils.fabricIdFromCertificate(certificate);
    const id = CryptoUtils.encode(clientId);
    logger.debug(stringFormat("Identity {0} and encodedId {1}", clientId, id));
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
    try {
      const ca = await this.CA();
      this.logger.debug(stringFormat("Enrolling {0}", enrollmentId));
      const enrollment: IEnrollResponse = await ca.enroll({
        enrollmentID: enrollmentId,
        enrollmentSecret: registration,
      });
      identity = FabricEnrollmentService.identityFromEnrollment(
        enrollment,
        this.caConfig.caName
      );
      this.logger.info(
        stringFormat(
          "Successfully enrolled {0} under {1} as {2}",
          enrollmentId,
          this.caConfig.caName,
          identity.id as string
        )
      );
    } catch (e: any) {
      throw this.parseError(e);
    }
    return identity;
  }

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
        stringFormat("Could not find enrollment with id {0}", enrollmentId)
      );
    let result: IServiceResponse;
    try {
      result = await ca.revoke(
        { enrollmentID: identity.id, reason: "User Deletation" },
        user
      );
    } catch (e: any) {
      throw new DLTError(
        stringFormat("Could not revoke enrollment with id {0}", enrollmentId)
      );
    }
    if (!result.success)
      throw new DLTError(
        stringFormat(
          "Could not revoke enrollment with id {0}:\n{1}",
          enrollmentId,
          result.errors.join("\n")
        )
      );
    return result;
  }
}
