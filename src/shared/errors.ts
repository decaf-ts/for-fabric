import { BaseError } from "@decaf-ts/db-decorators";

export class RegistrationError extends BaseError {
  constructor(msg: string | Error) {
    super(RegistrationError.name, msg, 401);
  }
}

export class EnrollmentError extends BaseError {
  constructor(msg: string | Error) {
    super(EnrollmentError.name, msg, 401);
  }
}
