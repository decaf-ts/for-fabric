import { Class } from "../Class";
import { ChildInterface } from "./ChildInterface";


/**
 * @class ChildClass
 * @template T
 * @extends {Class}
 * @implements {ChildInterface<T>}
 * @summary Generic class extending Class and implementing ChildInterface
 * @description This class extends the base Class and implements the ChildInterface.
 * It provides a generic implementation with additional properties and methods.
 *
 * @param {T} arg1 - The first argument for the constructor, of generic type T
 * @param {string} arg2 - The second argument for the constructor
 *
 * @memberOf module:ts-workspace.Namespace.ChildNamespace
 */
export class ChildClass<T> extends Class implements ChildInterface<T> {
  /**
   * @private
   * @property {T} [prop2] - A private property of generic type T
   */
  private prop2?: T;

  constructor(arg1: T, arg2: string) {
    super(arg1, arg2);
    this.prop2 = arg1;
  }

  /**
   * @summary Asynchronous method that returns a string
   * @description This method overrides the base class method. It returns a string
   * after a series of type assertions.
   * 
   * @template V
   * @returns {Promise<string>} A Promise that resolves to a string
   * @override
   */
  async method<V>(): Promise<string> {
    return "ok" as unknown as V as unknown as string;
  }

  /**
   * @summary Method that throws an error
   * @description This method implements the method2 from ChildInterface.
   * It throws an error with a message that includes the input argument.
   * 
   * @param {T} arg1 - The input argument of generic type T
   * @returns {Promise<string>} A Promise that always rejects with an error
   * @throws {Error} Always throws an error with a message including arg1
   */
  method2(arg1: T): Promise<string> {
    throw new Error("error" + arg1);
  }
}
