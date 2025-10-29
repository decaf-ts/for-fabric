import "reflect-metadata";

import { LogLevel, Logging } from "@decaf-ts/logging";
import { FabricLogger } from "../../src/client/logging";

describe("FabricLogger", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("forwards enabled log messages to underlying logger", () => {
    const logger = new FabricLogger("FabricLoggerTest", {
      level: LogLevel.verbose,
    });
    const forwarded = jest
      .spyOn((logger as any).logger, "info")
      .mockImplementation(() => undefined);

    logger.info("publishing-info");

    expect(forwarded).toHaveBeenCalledWith(
      expect.stringContaining("publishing-info")
    );
  });

  it("drops messages below configured threshold", () => {
    const logger = new FabricLogger("FabricLoggerTest", {
      level: LogLevel.error,
    });
    const forwarded = jest
      .spyOn((logger as any).logger, "verbose")
      .mockImplementation(() => undefined);

    logger.verbose("too-verbose");

    expect(forwarded).not.toHaveBeenCalled();
  });

  it("registers as default logging factory", () => {
    const scopedLogger = Logging.for("FabricFactory");
    expect(scopedLogger).toBeInstanceOf(FabricLogger);
  });
});
