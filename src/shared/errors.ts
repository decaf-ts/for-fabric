// /**
//  * @summary Base DLT Error
//  *
//  * @param {string} msg the error message
//  *
//  * @class BaseDLTError
//  * @extends Error
//  *
//  * @memberOf module:aeon-toolkit.SmartContracts
//  */
// export abstract class BaseDLTError extends Error {
//   protected constructor(name: string, msg: string | Error) {
//     if (msg instanceof BaseDLTError) return msg;
//     msg = `[${name}] ${msg instanceof Error ? msg.message : msg}`;
//     super(msg);
//   }
// }

// /**
//  * @summary Base DLT Error
//  *
//  * @param {string} msg the error message
//  *
//  * @class BaseDLTError
//  * @extends Error
//  *
//  * @memberOf module:aeon-toolkit.SmartContracts
//  */
// export class DLTError extends BaseDLTError {
//   constructor(msg: string | Error) {
//     super(DLTError.name, msg);
//   }
// }

// /**
//  * @summary Represents an overflow error in arithmetic operations in Smart Contracts
//  *
//  * @param {string} msg the error message
//  *
//  * @class OverflowError
//  * @extends BaseDLTError
//  *
//  * @memberOf module:aeon-toolkit.SmartContracts
//  */
// export class OverflowError extends BaseDLTError {
//   constructor(msg: string | Error) {
//     super(OverflowError.name, msg);
//   }
// }

// /**
//  * @summary Represents an Authorization error in Smart Contracts
//  *
//  * @param {string} msg the error message
//  *
//  * @class AuthorizationError
//  * @extends BaseDLTError
//  *
//  * @memberOf module:aeon-toolkit.SmartContracts
//  */
// export class AuthorizationError extends BaseDLTError {
//   constructor(msg: string | Error) {
//     super(AuthorizationError.name, msg);
//   }
// }

// /**
//  * @summary Represents a failure in balance to perform a transaction in Smart Contracts
//  *
//  * @param {string} msg the error message
//  *
//  * @class BalanceError
//  * @extends Error
//  *
//  * @memberOf module:aeon-toolkit.SmartContracts
//  */
// export class BalanceError extends BaseDLTError {
//   constructor(msg: string | Error) {
//     super(BalanceError.name, msg);
//   }
// }

// /**
//  * @summary Represents a failure in balance to create/update state in Smart Contracts
//  *
//  * @param {string} msg the error message
//  *
//  * @class BalanceError
//  * @extends BaseDLTError
//  *
//  * @memberOf module:aeon-toolkit.SmartContracts
//  */
// export class StateError extends BaseDLTError {
//   constructor(msg: string | Error) {
//     super(StateError.name, msg);
//   }
// }
// /**
//  * @summary Represents a failure in the Model details
//  *
//  * @param {string} msg the error message
//  *
//  * @class ValidationError
//  * @extends BaseDLTError
//  *
//  * @memberOf module:aeon-toolkit.SmartContracts
//  */
// export class ValidationError extends BaseDLTError {
//   constructor(msg: string | Error) {
//     super(ValidationError.name, msg);
//   }
// }
// /**
//  * @summary Represents a failure in the Model de/serialization
//  *
//  * @param {string} msg the error message
//  *
//  * @class SerializationError
//  * @extends BaseDLTError
//  *
//  * @memberOf module:aeon-toolkit.SmartContracts
//  */
// export class SerializationError extends BaseDLTError {
//   constructor(msg: string | Error) {
//     super(SerializationError.name, msg);
//   }
// }

// /**
//  * @summary Represents a failure in finding a model in the DLT
//  *
//  * @param {string} msg the error message
//  *
//  * @class NotFoundError
//  * @extends BaseDLTError
//  *
//  * @memberOf module:aeon-toolkit.SmartContracts
//  */
// export class NotFoundError extends BaseDLTError {
//   constructor(msg: string | Error) {
//     super(NotFoundError.name, msg);
//   }
// }
// /**
//  * @summary Represents a MVCC conflict in the DLT
//  *
//  * @param {string} msg the error message
//  *
//  * @class ConflictError
//  * @extends BaseDLTError
//  *
//  * @memberOf module:aeon-toolkit.SmartContracts
//  */
// export class ConflictError extends BaseDLTError {
//   constructor(msg: string | Error) {
//     super(ConflictError.name, msg);
//   }
// }

// /**
//  * @summary Represents a failure registrating new entities
//  *
//  * @param {string} msg the error message
//  *
//  * @class RegistrationError
//  * @extends BaseDLTError
//  *
//  * @memberOf module:aeon-toolkit.SmartContracts
//  */
// export class RegistrationError extends BaseDLTError {
//   constructor(msg: string | Error) {
//     super(RegistrationError.name, msg);
//   }
// }

import { BaseError } from "@decaf-ts/db-decorators";

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
