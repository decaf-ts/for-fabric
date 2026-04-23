import "reflect-metadata";

import { LogLevel } from "@decaf-ts/logging";
import { ContractLogger } from "../../src/contracts/logging";

describe("ContractLogger", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const buildContext = (
    options: { txId?: string; identityId?: string } = {}
  ) => {
    const backend = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      trace: jest.fn(),
      verbose: jest.fn(),
      silly: jest.fn(),
    };
    const logging = {
      getLogger: jest.fn(() => backend),
      setLevel: jest.fn(),
    };
    const ctx = {
      logging,
      stub: {
        getTxID: jest.fn(() => options.txId),
      },
      clientIdentity: {
        getID: jest.fn(() => options.identityId),
      },
    } as any;
    return { ctx, backend, logging };
  };

  it("emits a message-only payload by default when bound to Fabric context", () => {
    const { ctx, backend } = buildContext();
    const logger = new ContractLogger("ContractLoggerTest", { level: LogLevel.info }, ctx);

    logger.info("publishing-info");

    expect(backend.info).toHaveBeenCalledWith("publishing-info");
  });

  it("preserves meta/error API compatibility with MiniLogger signature", () => {
    const { ctx, backend } = buildContext();
    const logger = new ContractLogger("ContractLoggerTest", { level: LogLevel.debug }, ctx);

    logger.info("meta-info", { region: "eu", tx: 42 });
    logger.error("failure", new Error("boom"), { tx: "x-1" });

    expect(backend.info).toHaveBeenCalledWith(
      expect.stringContaining("meta-info")
    );
    expect(backend.info).toHaveBeenCalledWith(
      expect.stringContaining('{"region":"eu","tx":42}')
    );
    expect(backend.error).toHaveBeenCalledWith(
      expect.stringContaining("failure")
    );
    expect(backend.error).toHaveBeenCalledWith(
      expect.stringContaining("Stack trace:")
    );
  });

  it("respects explicit custom patterns", () => {
    const { ctx, backend } = buildContext();
    const logger = new ContractLogger(
      "ContractLoggerTest",
      { level: LogLevel.info, pattern: "{level} {message}" as any },
      ctx
    );

    logger.info("with-pattern");

    expect(backend.info).toHaveBeenCalledWith(
      expect.stringContaining("INFO with-pattern")
    );
  });

  it("populates and renders correlationId and user from Fabric context", () => {
    const { ctx, backend } = buildContext({
      txId: "tx-123",
      identityId:
        "x509::/OU=client/OU=org/CN=alice/emailAddress=alice@example.com::/C=US/ST=CA/L=SF/O=Org/CN=ca.org",
    });
    const logger = new ContractLogger("ContractLoggerTest", { level: LogLevel.info }, ctx);

    logger.info("hello");

    expect(backend.info).toHaveBeenCalledWith(
      expect.stringContaining(", correlationId: tx-123")
    );
    expect(backend.info).toHaveBeenCalledWith(
      expect.stringContaining(", user: alice@example.com")
    );
    expect(backend.info).toHaveBeenCalledWith(expect.stringContaining("hello"));
  });

  it("trims auto-populated Fabric tx correlation id to first/last 5 chars", () => {
    const { ctx, backend } = buildContext({
      txId: "1234567890ABCDEFGHIJ",
      identityId: "x509::/CN=bob/emailAddress=bob@example.com::/C=US",
    });
    const logger = new ContractLogger("ContractLoggerTest", { level: LogLevel.info }, ctx);

    logger.info("hello");

    expect(backend.info).toHaveBeenCalledWith(
      expect.stringContaining(", correlationId: 12345-FGHIJ")
    );
  });
});
