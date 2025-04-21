import { Interface } from "../Interface";

/**
 * @interface ChildInterface
 * @template T
 * @extends {Interface}
 * @summary Generic interface extending Interface with an additional method
 * @description This interface extends the base {@link Interface} and adds a new generic method.
 * It provides a contract for objects that implement both the original Interface methods
 * and the new method2.
 *
 * @memberOf module:ts-workspace.Namespace.ChildNamespace
 */
export interface ChildInterface<T> extends Interface {
  /**
   * @summary Generic method that returns a Promise<string>
   * @description This method takes an argument of type T and returns a Promise that resolves to a string.
   *
   * @template T
   * @param {T} arg1 - The input argument of generic type T
   * @returns {Promise<string>} A Promise that resolves to a string
   */
  method2(arg1: T): Promise<string>;
}