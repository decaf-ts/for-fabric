import {
  LoggerFactory,
  Logging,
  LogLevel,
  LogMeta,
  MiniLogger,
  NumericLogLevels,
  StringLike,
} from "@decaf-ts/logging";
import { LoggingConfig } from "@decaf-ts/logging";
import { Context as Ctx } from "fabric-contract-api";
import { InternalError } from "@decaf-ts/db-decorators";
import {
  enrichContractLoggingConfig,
  ensureContractLogFieldRegistration,
} from "../contract/logging-context";

ensureContractLogFieldRegistration();

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
  protected sink!: {
    verbose: (msg: string) => void;
    info: (msg: string) => void;
    debug: (msg: string) => void;
    error: (msg: string) => void;
    trace: (msg: string) => void;
    warn: (msg: string) => void;
    silly: (msg: string) => void;
  };

  constructor(
    context: string,
    conf: Partial<LoggingConfig> | undefined,
    ctx?: Ctx
  ) {
    const normalizedConfig = enrichContractLoggingConfig(conf, ctx);
    super(context, normalizedConfig);

    if (!ctx) {
      this.sink = {
        info: (msg: string) => console.log(msg),
        verbose: (msg: string) => console.log(msg),
        debug: (msg: string) => console.debug(msg),
        error: (msg: string) => console.error(msg),
        trace: (msg: string) => console.trace(msg),
        warn: (msg: string) => console.warn(msg),
        silly: (msg: string) => console.debug(msg),
      };
    } else {
      this.sink = ctx.logging.getLogger(context) as unknown as typeof this.sink;
      ctx.logging.setLevel(
        normalizedConfig?.level || Logging.getConfig().level
      );
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
    error?: Error,
    meta?: LogMeta
  ) {
    if (
      NumericLogLevels[this.config("level") as LogLevel] <
      NumericLogLevels[level]
    )
      return;

    let method;
    switch (level) {
      case LogLevel.benchmark:
        method = this.sink.verbose;
        break;
      case LogLevel.info:
        method = this.sink.info;
        break;
      case LogLevel.verbose:
        method = this.sink.verbose;
        break;
      case LogLevel.debug:
        method = this.sink.debug;
        break;
      case LogLevel.error:
        method = this.sink.error;
        break;
      case LogLevel.trace:
        method = this.sink.trace;
        break;
      case LogLevel.warn:
        method = this.sink.warn;
        break;
      case LogLevel.silly:
        method = this.sink.silly;
        break;
      default:
        throw new InternalError("Invalid log level");
    }
    method.call(this.sink, this.createLog(level, msg, error, meta));
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
