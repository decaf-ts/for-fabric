import { User } from "@decaf-ts/core";

import {
  CryptoSetting,
  ICryptoKey,
  ICryptoSuite,
  IIdentity,
  ISigningIdentity,
  User as Usr,
  UserConfig,
} from "fabric-common";
import { FabricAdapter } from "./adapter";
import { model, ModelArg, prop } from "@decaf-ts/decorator-validation";

@model()
export class FabricUser extends User {
  @prop()
  private user!: Usr;

  constructor(arg: ModelArg<FabricAdapter> | string | UserConfig) {
    if (typeof arg === "string") {
      arg = JSON.parse(arg);
    }
    super(arg as ModelArg<FabricAdapter>);
  }

  protected static fromFabric(usr: Usr): FabricUser {
    return new FabricUser({
      user: usr,
    });
  }

  static createUser(
    name: string,
    password: string,
    mspid: string,
    signedCertPem: string,
    privateKeyPEM?: string
  ): FabricUser {
    return FabricUser.fromFabric(
      Usr.createUser(name, password, mspid, signedCertPem, privateKeyPEM)
    );
  }
  static isInstance(object: any): boolean {
    return Usr.isInstance(object);
  }
  static newCryptoSuite(options?: CryptoSetting): ICryptoSuite {
    return Usr.newCryptoSuite(options);
  }

  getName(): string {
    return this.user.getName();
  }
  getMspid(): string {
    return this.user.getMspid();
  }
  getRoles(): string[] {
    return this.user.getRoles();
  }
  setRoles(roles: string[]): void {
    return this.user.setRoles(roles);
  }
  getAffiliation(): string {
    return this.user.getAffiliation();
  }
  setAffiliation(affiliation: string) {
    return this.user.setAffiliation(affiliation);
  }
  getEnrollmentSecret(): string {
    return this.user.getEnrollmentSecret();
  }
  getIdentity(): IIdentity {
    return this.user.getIdentity();
  }
  getSigningIdentity(): ISigningIdentity {
    return this.user.getSigningIdentity();
  }
  setSigningIdentity(signingIdentity: ISigningIdentity): void {
    return this.user.setSigningIdentity(signingIdentity);
  }
  getCryptoSuite(): ICryptoSuite {
    return this.user.getCryptoSuite();
  }
  setCryptoSuite(suite: ICryptoSuite): void {
    return this.user.setCryptoSuite(suite);
  }
  setEnrollment(
    privateKey: ICryptoKey,
    certificate: string,
    mspId: string
  ): Promise<void> {
    return this.user.setEnrollment(privateKey, certificate, mspId);
  }
  isEnrolled(): boolean {
    return this.user.isEnrolled();
  }
  async fromString(str: string): Promise<FabricUser> {
    return FabricUser.fromFabric(await this.user.fromString(str));
  }
}
