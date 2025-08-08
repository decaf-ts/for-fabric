/**
 * @summary Base DLT Error
 *
 * @param {string} msg the error message
 *
 * @class BaseDLTError
 * @extends Error
 *
 * @memberOf module:aeon-toolkit.SmartContracts
 */
export abstract class BaseDLTError extends Error {
  protected constructor(name: string, msg: string | Error) {
    if (msg instanceof BaseDLTError) return msg;
    msg = `[${name}] ${msg instanceof Error ? msg.message : msg}`;
    super(msg);
  }
}

/**
 * @summary Base DLT Error
 *
 * @param {string} msg the error message
 *
 * @class BaseDLTError
 * @extends Error
 *
 * @memberOf module:aeon-toolkit.SmartContracts
 */
export class DLTError extends BaseDLTError {
  constructor(msg: string | Error) {
    super(DLTError.name, msg);
  }
}

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
export class OverflowError extends BaseDLTError {
  constructor(msg: string | Error) {
    super(OverflowError.name, msg);
  }
}

/**
 * @summary Represents an Authorization error in Smart Contracts
 *
 * @param {string} msg the error message
 *
 * @class AuthorizationError
 * @extends BaseDLTError
 *
 * @memberOf module:aeon-toolkit.SmartContracts
 */
export class AuthorizationError extends BaseDLTError {
  constructor(msg: string | Error) {
    super(AuthorizationError.name, msg);
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
export class BalanceError extends BaseDLTError {
  constructor(msg: string | Error) {
    super(BalanceError.name, msg);
  }
}

/**
 * @summary Represents a failure in balance to create/update state in Smart Contracts
 *
 * @param {string} msg the error message
 *
 * @class BalanceError
 * @extends BaseDLTError
 *
 * @memberOf module:aeon-toolkit.SmartContracts
 */
export class StateError extends BaseDLTError {
  constructor(msg: string | Error) {
    super(StateError.name, msg);
  }
}
/**
 * @summary Represents a failure in the Model details
 *
 * @param {string} msg the error message
 *
 * @class ValidationError
 * @extends BaseDLTError
 *
 * @memberOf module:aeon-toolkit.SmartContracts
 */
export class ValidationError extends BaseDLTError {
  constructor(msg: string | Error) {
    super(ValidationError.name, msg);
  }
}
/**
 * @summary Represents a failure in the Model de/serialization
 *
 * @param {string} msg the error message
 *
 * @class SerializationError
 * @extends BaseDLTError
 *
 * @memberOf module:aeon-toolkit.SmartContracts
 */
export class SerializationError extends BaseDLTError {
  constructor(msg: string | Error) {
    super(SerializationError.name, msg);
  }
}

/**
 * @summary Represents a failure in finding a model in the DLT
 *
 * @param {string} msg the error message
 *
 * @class NotFoundError
 * @extends BaseDLTError
 *
 * @memberOf module:aeon-toolkit.SmartContracts
 */
export class NotFoundError extends BaseDLTError {
  constructor(msg: string | Error) {
    super(NotFoundError.name, msg);
  }
}
/**
 * @summary Represents a MVCC conflict in the DLT
 *
 * @param {string} msg the error message
 *
 * @class ConflictError
 * @extends BaseDLTError
 *
 * @memberOf module:aeon-toolkit.SmartContracts
 */
export class ConflictError extends BaseDLTError {
  constructor(msg: string | Error) {
    super(ConflictError.name, msg);
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
export class RegistrationError extends BaseDLTError {
  constructor(msg: string | Error) {
    super(RegistrationError.name, msg);
  }
}
