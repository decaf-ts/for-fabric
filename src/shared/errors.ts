import { BaseError, InternalError } from "@decaf-ts/db-decorators";
import { AuthorizationError } from "@decaf-ts/core";
// import { MISSING_PRIVATE_DATA_ERROR_MESSAGE } from "../contracts/private-data";
/**
 * @summary Represents an overflow error in arithmetic operations in Smart Contracts
 *
 * @param {string} msg the error message
 *
 * @class OverflowError
 * @extends InternalError
 *
 * @category Errors
 */
export class OverflowError extends InternalError {
  constructor(msg: string | Error) {
    super(msg, OverflowError.name);
  }
}

/**
 * @summary Represents a failure in balance to perform a transaction in Smart Contracts
 *
 * @param {string} msg the error message
 *
 * @class BalanceError
 * @extends InternalError
 *
 * @category Errors
 */
export class BalanceError extends InternalError {
  constructor(msg: string | Error) {
    super(msg, BalanceError.name);
  }
}

/**
 * @summary Represents a failure in balance to perform a transaction in Smart Contracts
 *
 * @param {string} msg the error message
 *
 * @class BalanceError
 * @extends InternalError
 *
 * @category Errors
 */
export class AllowanceError extends InternalError {
  constructor(msg: string | Error) {
    super(msg, AllowanceError.name);
  }
}

/**
 * @summary Represents a failure registrating new entities
 *
 * @param {string} msg the error message
 *
 * @class RegistrationError
 *
 * @categort Errors
 */
export class RegistrationError extends AuthorizationError {
  constructor(msg: string | Error) {
    super(msg, RegistrationError.name);
  }
}

/**
 * @description Error thrown when an unsupported operation is attempted
 * @summary This error is thrown when an operation is requested that is not supported by the current
 * persistence adapter or configuration. It extends the BaseError class and sets a 500 status code.
 * @param {string|Error} msg - The error message or an Error object to wrap
 * @class UnsupportedError
 * @example
 * ```typescript
 * // Throwing an UnsupportedError
 * if (!adapter.supportsTransactions()) {
 *   throw new UnsupportedError('Transactions are not supported by this adapter');
 * }
 *
 * // Catching an UnsupportedError
 * try {
 *   await adapter.beginTransaction();
 * } catch (error) {
 *   if (error instanceof UnsupportedError) {
 *     console.error('Operation not supported:', error.message);
 *   }
 * }
 * ```
 *
 * @category Errors
 */
export class MissingContextError extends InternalError {
  constructor(msg: string | Error) {
    super(msg, MissingContextError.name, 500);
  }
}

export class UnauthorizedPrivateDataAccess extends BaseError {
  constructor(msg: string | Error = "MISSING_PRIVATE_DATA_ERROR_MESSAGE") {
    super(UnauthorizedPrivateDataAccess.name, msg, 403);
  }
}

/**
 * Represents an error that occurs when a required initialization step is not performed.
 *
 * @class NotInitializedError
 * @extends BaseError
 *
 * @category Errors
 *
 * @param {string | Error} msg - The error message or an Error object to wrap.
 *
 * @throws {NotInitializedError} - Throws an error when a required initialization step is not performed.
 *
 * @example
 * ```typescript
 * // Initialize the application
 * if (!isInitialized) {
 *   throw new NotInitializedError('Application is not initialized');
 * }
 *
 * // Catching an NotInitializedError
 * try {
 *   // Perform operations that require initialization
 * } catch (error) {
 *   if (error instanceof NotInitializedError) {
 *     console.error('Initialization error:', error.message);
 *   }
 * }
 * ```
 */
export class NotInitializedError extends BaseError {
  constructor(msg: string | Error) {
    super(NotInitializedError.name, msg, 409);
  }
}

export class MissingPKCSS11Lib extends InternalError {
  constructor(msg: string | Error) {
    super(msg, MissingPKCSS11Lib.name, 500);
  }
}

export class EndorsementError extends InternalError {
  constructor(message: string | Error) {
    super(message, EndorsementError.name, 500);
  }
}

export class MvccReadConflictError extends InternalError {
  constructor(message: string | Error) {
    super(message, MvccReadConflictError.name, 500);
  }
}

export class PhantomReadConflictError extends InternalError {
  constructor(message: string | Error) {
    super(message, PhantomReadConflictError.name, 500);
  }
}

export class EndorsementPolicyError extends InternalError {
  constructor(message: string | Error) {
    super(message, EndorsementPolicyError.name, 500);
  }
}
