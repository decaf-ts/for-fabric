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
import { Context as Ctx } from "fabric-contract-api";
import { InternalError } from "@decaf-ts/db-decorators";

/**
 * @description Logger implementation for Fabric chaincode contracts
 * @summary Adapts the standard logging interface to work with Fabric's chaincode context
 *
 * @param {string} context - The logging context name
 * @param {Partial<LoggingConfig> | undefined} conf - Optional logging configuration
 * @param {Ctx} ctx - The Fabric chaincode context
 *
 * @class ContractLogger
 * @extends {MiniLogger}
 * @example
 * ```typescript
 * // In a Fabric chaincode contract
 * import { ContractLogger } from '@decaf-ts/for-fabric';
 *
 * export class MyContract extends Contract {
 *   @Transaction()
 *   async myFunction(ctx: Context): Promise<void> {
 *     const logger = new ContractLogger('MyContract', { level: 'info' }, ctx);
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
export class ContractLogger extends MiniLogger {
  /**
   * @description The underlying Fabric logger instance
   */
  protected logger!: Logger;

  constructor(
    context: string,
    conf: Partial<LoggingConfig> | undefined,
    ctx?: Ctx
  ) {
    super(context, conf);

    if (!ctx) {
      this.logger = new MiniLogger(context, conf);
    } else {
      this.logger = ctx.logging.getLogger(context) as unknown as Logger;
    }
  }

  /**
   * @description Logs a message at the specified level
   * @summary Overrides the base log method to use the Fabric context's logger
   * @param {LogLevel} level - The log level
   * @param {StringLike | Error} msg - The message to log
   * @param {Error} [stack] - Optional stack trace for errors
   * @return {void}
   */
  protected override log(
    level: LogLevel,
    msg: StringLike | Error,
    stack?: Error
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
      case LogLevel.warn:
        method = this.logger.warn;
        break;
      case LogLevel.silly:
        method = this.logger.silly;
        break;
      default:
        throw new InternalError("Invalid log level");
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
  object?: string,
  config?: Partial<LoggingConfig>,
  ctx?: Ctx
) => {
  return new ContractLogger(
    object || ContractLogger.name,
    config || {},
    ctx as Ctx
  );
};

// Set the factory as the default logger factory
Logging.setFactory(factory);
