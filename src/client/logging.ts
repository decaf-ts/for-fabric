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
 * @description Logger implementation tailored for Hyperledger Fabric clients.
 * @summary Adapts the decaf-ts MiniLogger to route messages through a per-context Fabric logger, honoring configured log levels and formatting.
 * @param {string} context - The logging context name used to scope the logger instance.
 * @param {Partial<LoggingConfig> | undefined} conf - Optional logging configuration to override defaults for this context.
 * @class FabricLogger
 * @example
 * ```typescript
 * // In a Fabric client/service
 * const logger = new FabricLogger('MyFabricService', { level: 'info' });
 * logger.info('Processing transaction');
 * logger.debug('Transaction details', { txId: '123' });
 * logger.error('Something went wrong');
 * ```
 * @mermaid
 * sequenceDiagram
 *   autonumber
 *   participant C as Caller
 *   participant FL as FabricLogger
 *   participant ML as MiniLogger (delegate)
 *   C->>FL: info('Processing transaction')
 *   FL->>FL: createLog(level,msg,stack)
 *   FL->>ML: info(log)
 *   C->>FL: error(new Error('x'))
 *   FL->>FL: createLog(level,msg,stack)
 *   FL->>ML: error(log)
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
   * @description Logs a message at the specified level.
   * @summary Overrides the base MiniLogger.log to forward to the internal Fabric-aware logger, enforcing configured thresholds.
   * @param {LogLevel} level - The log level to use for this message.
   * @param {StringLike | Error} msg - The message or error to log.
   * @param {string} [stack] - Optional stack trace string for errors.
   * @return {void}
   * @mermaid
   * sequenceDiagram
   *   autonumber
   *   participant C as Caller
   *   participant FL as FabricLogger
   *   participant ML as MiniLogger (delegate)
   *   C->>FL: log(level, msg, stack?)
   *   FL->>FL: check configured level
   *   alt below threshold
   *     FL-->>C: return
   *   else above threshold
   *     FL->>FL: createLog(level, msg, stack)
   *     FL->>ML: method.call(logger, log)
   *     ML-->>FL: void
   *   end
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
 * @description Factory function for creating FabricLogger instances.
 * @summary Produces a new FabricLogger bound to the provided context name and configuration.
 * @param {string} object - The logging context name.
 * @param {Partial<LoggingConfig> | undefined} config - Optional logging configuration.
 * @return {FabricLogger} A new FabricLogger instance.
 * @function factory
 * @memberOf module:client
 */
const factory: LoggerFactory = (
  object: string,
  config: Partial<LoggingConfig> | undefined
) => {
  return new FabricLogger(object, config || {});
};

// Set the factory as the default logger factory
Logging.setFactory(factory);
