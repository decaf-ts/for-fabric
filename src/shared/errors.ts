import { BaseError } from "@decaf-ts/db-decorators";
import { MISSING_PRIVATE_DATA_ERROR_MESSAGE } from "../contracts/private-data";
/**
 * @summary Represents an overflow error in arithmetic operations in Smart Contracts
 *
 * @param {string} msg the error message
 *
 * @class OverflowError
 * @extends BaseDLTError
 *
 * @memberOf module:aeon-toolkit.SmartContracts
 */
export class OverflowError extends BaseError {
  constructor(msg: string | Error) {
    super(OverflowError.name, msg);
  }
}

/**
 * @summary Represents a failure in balance to perform a transaction in Smart Contracts
 *
 * @param {string} msg the error message
 *
 * @class BalanceError
 * @extends Error
 *
 * @memberOf module:aeon-toolkit.SmartContracts
 */
export class BalanceError extends BaseError {
  constructor(msg: string | Error) {
    super(BalanceError.name, msg);
  }
}

/**
 * @summary Represents a failure registrating new entities
 *
 * @param {string} msg the error message
 *
 * @class RegistrationError
 * @extends BaseDLTError
 *
 * @memberOf module:aeon-toolkit.SmartContracts
 */
export class RegistrationError extends BaseError {
  constructor(msg: string | Error) {
    super(RegistrationError.name, msg);
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
 */
export class MissingContextError extends BaseError {
  constructor(msg: string | Error) {
    super(MissingContextError.name, msg, 500);
  }
}

export class UnauthorizedPrivateDataAccess extends BaseError {
  constructor(msg: string | Error = MISSING_PRIVATE_DATA_ERROR_MESSAGE) {
    super(MissingContextError.name, msg, 403);
  }
}
