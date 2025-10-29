import { AuthorizationError } from "@decaf-ts/core";
import { InternalError } from "@decaf-ts/db-decorators";
import {
  AllowanceError,
  BalanceError,
  MissingContextError,
  NotInitializedError,
  OverflowError,
  RegistrationError,
  UnauthorizedPrivateDataAccess,
} from "../../src/shared/errors";

describe("shared/errors", () => {
  it("creates overflow and balance errors extending InternalError", () => {
    const overflow = new OverflowError("overflow");
    const balance = new BalanceError("balance");

    expect(overflow).toBeInstanceOf(InternalError);
    expect(balance).toBeInstanceOf(InternalError);
    expect(overflow.message).toContain("overflow");
    expect(balance.message).toContain("balance");
  });

  it("creates allowance error extending InternalError", () => {
    const error = new AllowanceError("allowance");
    expect(error).toBeInstanceOf(InternalError);
    expect(error.message).toContain("allowance");
  });

  it("creates registration error extending AuthorizationError", () => {
    const error = new RegistrationError("registration");
    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error.message).toContain("registration");
  });

  it("creates missing context error with code 500", () => {
    const error = new MissingContextError("missing");
    expect(error).toBeInstanceOf(InternalError);
    expect((error as any).code).toBe(500);
  });

  it("creates unauthorized private data access error with default code 403", () => {
    const error = new UnauthorizedPrivateDataAccess();
    expect((error as any).code).toBe(403);
  });

  it("creates not initialized error with code 409", () => {
    const error = new NotInitializedError("init");
    expect((error as any).code).toBe(409);
    expect(error.message).toContain("init");
  });
});
