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

export class ContractLogger extends MiniLogger {
  protected logger: Logger;

  constructor(
    context: string,
    conf: Partial<LoggingConfig> | undefined,
    ctx: Ctx
  ) {
    super(context, conf);
    this.logger = ctx.logging.getLogger(context) as unknown as Logger;
    ctx.logging.setLevel(this.config("level") as string);
  }

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

const factory: LoggerFactory = (
  object: string,
  config: Partial<LoggingConfig> | undefined,
  ctx: Ctx
) => {
  return new ContractLogger(object, config || {}, ctx);
};

Logging.setFactory(factory);
