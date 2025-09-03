import { Logger, Logging } from "@decaf-ts/logging";

export abstract class LoggedService {
  private static _log?: Logger;

  private _log?: Logger;

  protected constructor() {}

  protected get log(): Logger {
    if (!this._log) this._log = Logging.for(this.constructor.name);
    return this._log;
  }

  protected static get log(): Logger {
    if (!LoggedService._log) LoggedService._log = Logging.get();
    return LoggedService._log;
  }
}
