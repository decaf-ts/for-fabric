import { IRegisterRequest, IKeyValueAttribute } from "fabric-ca-client";
import { CA_ROLE } from "./constants";
import {
  min,
  minlength,
  Model,
  required,
} from "@decaf-ts/decorator-validation";
import { ValidationError } from "@decaf-ts/db-decorators";

export class RegistrationRequestBuilder extends Model {
  @required()
  affiliation: string = "";
  @minlength(1)
  attrs?: IKeyValueAttribute[];
  @required()
  enrollmentID!: string;
  @required()
  enrollmentSecret!: string;
  @min(0)
  maxEnrollments?: number;
  @required()
  role!: string;

  build(): IRegisterRequest {
    const errs = this.hasErrors();
    if (errs) throw new ValidationError(errs.toString());
    const response: IRegisterRequest = {
      enrollmentID: this.enrollmentID,
      enrollmentSecret: this.enrollmentSecret,
      role: this.role,
      affiliation: this.affiliation,
    };
    if (typeof this.maxEnrollments !== "undefined")
      response.maxEnrollments = this.maxEnrollments;
    if (this.attrs) response.attrs = this.attrs;
    return response;
  }

  setAffiliation(value: string) {
    this.affiliation = value;
    return this;
  }

  addAttr(attr: IKeyValueAttribute) {
    this.attrs = this.attrs || [];
    this.attrs.push(attr);
    return this;
  }

  setAttrs(value: IKeyValueAttribute[]) {
    this.attrs = value;
    return this;
  }

  setEnrollmentID(value: string) {
    this.enrollmentID = value;
    return this;
  }

  setEnrollmentSecret(value: string) {
    this.enrollmentSecret = value;
    return this;
  }

  setMaxEnrollments(value: number) {
    this.maxEnrollments = value;
    return this;
  }

  setRole(value: CA_ROLE | string) {
    this.role = value;
    return this;
  }
}
