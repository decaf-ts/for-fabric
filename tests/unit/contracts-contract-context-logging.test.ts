import "reflect-metadata";

import { FabricContractContext } from "../../src/contracts/ContractContext";
import { ContractLogger } from "../../src/contracts/logging";

describe("contracts/ContractContext", () => {
  it("exposes stub, timestamp, identity and logger getters", () => {
    const context = new FabricContractContext();
    const stub = {
      getDateTimestamp: jest.fn().mockReturnValue(new Date("2024-01-01T00:00:00Z")),
    };
    const identity = { getID: jest.fn().mockReturnValue("user1") };
    const logger = { info: jest.fn() };

    context.accumulate({
      stub,
      clientIdentity: identity,
      logger,
    });

    expect(context.stub).toBe(stub);
    expect(context.timestamp.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(context.identity).toBe(identity);
    expect(context.logger).toBe(logger);
  });

  it("falls back to identity key when clientIdentity missing", () => {
    const context = new FabricContractContext();
    const identity = { getID: jest.fn().mockReturnValue("fallback") };
    const stub = {
      getDateTimestamp: jest.fn().mockReturnValue(new Date("2024-01-02T00:00:00Z")),
    };

    context.accumulate({ stub, identity });

    expect(context.identity).toBe(identity);
  });
});

describe("contracts/logging ContractLogger", () => {
  it("delegates logging to context logger respecting level", () => {
    const logger = {
      info: jest.fn(),
      verbose: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      silly: jest.fn(),
      for: jest.fn().mockReturnThis(),
    };
    const context = new FabricContractContext();
    context.accumulate({ logger });

    const contractLogger = new ContractLogger(
      "TestContract",
      { level: "info" },
      context
    );

    contractLogger.info("hello");
    contractLogger.debug("hidden");

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0][0]).toMatch(/hello/);
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it("falls back to MiniLogger when context missing", () => {
    const contractLogger = new ContractLogger("TestContract", { level: "info" });
    expect(() => contractLogger.info("hello")).not.toThrow();
  });
});
