import {
  LoggerFactory,
  Logging,
  Logger,
  LogLevel,
  MiniLogger,
  NumericLogLevels,
  StringLike,
} from "@decaf-ts/logging";
import { LoggingConfig } from "@decaf-ts/logging";

/**
 * @description Logger implementation for Fabric API
 * @summary Adapts the standard logging interface to work with Fabric API
 *
 * @param {string} context - The logging context name
 * @param {Partial<LoggingConfig> | undefined} conf - Optional logging configuration
 *
 * @class FabricLogger
 * @extends {MiniLogger}
 * @example
 * ```typescript
 * // In a Fabric chaincode contract
 * import { ContractLogger } from '@decaf-ts/for-fabric';
 *
 * export class MyFabricService {
 *   async myFunction(): Promise<void> {
 *     const logger = new FabricLogger('MyFabricService', { level: 'info' });
 *
 *     logger.info('Processing transaction');
 *     logger.debug('Transaction details:', { ... });
 *
 *     // Do something
 *
 *     logger.info('Transaction complete');
 *   }
 * }
 * ```
 */
export class FabricLogger extends MiniLogger {
  /**
   * @description The underlying Fabric logger instance
   */
  protected logger: Logger;

  constructor(context: string, conf: Partial<LoggingConfig> | undefined) {
    super(context, conf);
    this.logger = new MiniLogger(context, conf);
  }

  /**
   * @description Logs a message at the specified level
   * @summary Overrides the base log method to use the Fabric context's logger
   * @param {LogLevel} level - The log level
   * @param {StringLike | Error} msg - The message to log
   * @param {string} [stack] - Optional stack trace for errors
   * @return {void}
   */
  protected override log(
    level: LogLevel,
    msg: StringLike | Error,
    stack?: string
  ) {
    if (
      NumericLogLevels[this.config("level") as LogLevel] <
      NumericLogLevels[level]
    )
      return;

    let method;
    switch (level) {
      case LogLevel.info:
        method = this.logger.info;
        break;
      case LogLevel.verbose:
        method = this.logger.verbose;
        break;
      case LogLevel.debug:
        method = this.logger.debug;
        break;
      case LogLevel.error:
        method = this.logger.error;
        break;
      case LogLevel.silly:
        method = this.logger.silly;
        break;
      default:
        throw new Error("Invalid log level");
    }
    method.call(this.logger, this.createLog(level, msg, stack));
  }
}

/**
 * @description Factory function for creating ContractLogger instances
 * @summary Creates a new ContractLogger with the given context, config, and Fabric context
 * @param {string} object - The logging context name
 * @param {Partial<LoggingConfig> | undefined} config - Optional logging configuration
 * @param {Ctx} ctx - The Fabric chaincode context
 * @return {ContractLogger} A new ContractLogger instance
 * @function factory
 * @memberOf module:fabric.contracts
 */
const factory: LoggerFactory = (
  object: string,
  config: Partial<LoggingConfig> | undefined
) => {
  return new FabricLogger(object, config || {});
};

// Set the factory as the default logger factory
Logging.setFactory(factory);
