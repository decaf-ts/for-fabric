import { Logger, Logging } from "@decaf-ts/logging";

/**
 * @description Base service with logging utilities
 * @summary Provides a lightweight abstract class that equips inheriting services with per-instance and static logger accessors using the decaf-ts logging facility. Intended to standardize logging across client-side services.
 * @param {void} constructor - No constructor parameters; inheritors should call super()
 * @return {void}
 * @class LoggedService
 * @example
 * // Extend LoggedService to gain logging helpers
 * class UserService extends LoggedService {
 *   async doWork() {
 *     const log = this.log.for(this.doWork);
 *     log.info("Working...");
 *   }
 * }
 *
 * // Static logger for class-level logging
 * const sLog = (UserService as any).log;
 * sLog.debug("Class level message");
 */
export abstract class LoggedService {
  /**
   * @description Cached static logger shared by all instances of this class
   */
  private static _log?: Logger;

  /**
   * @description Lazily created logger scoped to the concrete service instance
   */
  private _log?: Logger;

  protected constructor() {}

  /**
   * @description Retrieves or creates the instance logger
   * @summary Lazily initializes a logger using the class name of the concrete service and returns it for use in instance methods
   * @return {Logger} The instance-specific logger
   */
  protected get log(): Logger {
    if (!this._log) this._log = Logging.for(this.constructor.name);
    return this._log;
  }

  /**
   * @description Retrieves or creates the static logger for the class
   * @summary Provides a logger not bound to a specific instance, suitable for class-level diagnostics
   * @return {Logger} The class-level logger
   */
  protected static get log(): Logger {
    if (!LoggedService._log) LoggedService._log = Logging.get();
    return LoggedService._log;
  }
}
