import { stringFormat } from "@decaf-ts/decorator-validation";
import { OverflowError } from "./errors";
import { ValidationError } from "@decaf-ts/db-decorators";

/**
 * @summary Overflow safe Addition operation
 *
 * @param {number} a
 * @param {number} b
 *
 * @function add
 *
 * @throws {OverflowError} on addition overflow
 *
 * @memberOf module:aeon-toolkit.SmartContracts
 */
export function add(a: number, b: number): number {
  const c = a + b;
  if (a !== c - b || b !== c - a) {
    throw new OverflowError(`Addition overflow: ${a} + ${b}`);
  }
  return c;
}

/**
 * @summary Overflow safe Subtraction operation
 *
 * @param {number} a
 * @param {number} b
 *
 * @function sub
 *
 * @throws {OverflowError} on subtaction overflow
 *
 * @memberOf module:aeon-toolkit.SmartContracts
 */
export function sub(a: number, b: number): number {
  const c = a - b;
  if (a !== c + b || b !== a - c) {
    throw new OverflowError(`Subtraction overflow: ${a} - ${b}`);
  }
  return c;
}

/**
 * @summary Safe Integer Parse
 *
 * @param {string} string
 *
 * @function safeParseInt
 *
 * @throws {ValidationError} if parseInt returns NaN
 *
 * @memberOf module:aeon-toolkit.SmartContracts
 */
export function safeParseInt(string: string): number {
  // Regular expression to check if string only have digits
  const digitRegex = /^\d+$/;
  if (!digitRegex.test(string)) {
    throw new ValidationError(
      stringFormat("Failed to parse: {0}", "string contains digits")
    );
  }
  const parsedint = parseInt(string);
  if (isNaN(parsedint)) {
    throw new ValidationError(
      stringFormat("Failed to parse: {0}", "string is not a parsable integer")
    );
  }
  return parsedint;
}
