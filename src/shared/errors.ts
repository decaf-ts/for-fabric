import { InternalError } from "@decaf-ts/db-decorators";
import { AuthorizationError } from "@decaf-ts/core";
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
