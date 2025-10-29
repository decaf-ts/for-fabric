import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { generateKeyPairSync } from "crypto";

import { CoreUtils } from "../../src/shared/utils";

jest.mock("@hyperledger/fabric-gateway", () => {
  const signerMock = jest.fn();
  return {
    signers: {
      newPrivateKeySigner: signerMock,
    },
    __mocks: { signerMock },
  };
});

const { __mocks } = jest.requireMock("@hyperledger/fabric-gateway") as {
  __mocks: { signerMock: jest.Mock };
};
const signerMock = __mocks.signerMock;

jest.mock("fabric-common", () => {
  const setCryptoSuiteMock = jest.fn();
  const setEnrollmentMock = jest.fn().mockResolvedValue(undefined);
  const createKeyFromRawMock = jest.fn(() => "importedKey");
  const newCryptoSuiteMock = jest.fn(() => ({
    createKeyFromRaw: createKeyFromRawMock,
  }));

  class User {
    static newCryptoSuite = newCryptoSuiteMock;
    public setCryptoSuite = setCryptoSuiteMock;
    public setEnrollment = setEnrollmentMock;
    constructor(public readonly name: string) {}
  }

  return {
    User,
    __mocks: {
      setCryptoSuiteMock,
      setEnrollmentMock,
      createKeyFromRawMock,
      newCryptoSuiteMock,
    },
  };
});

const {
  __mocks: fabricCommonMocks,
} = jest.requireMock("fabric-common") as {
  __mocks: {
    setCryptoSuiteMock: jest.Mock;
    setEnrollmentMock: jest.Mock;
    createKeyFromRawMock: jest.Mock;
    newCryptoSuiteMock: jest.Mock;
  };
};

const {
  setCryptoSuiteMock,
  setEnrollmentMock,
  createKeyFromRawMock,
  newCryptoSuiteMock,
} = fabricCommonMocks;

describe("shared/utils CoreUtils", () => {
const certificatePem = `-----BEGIN CERTIFICATE-----
MIICFTCCAbugAwIBAgIUfJX7hC/K370mvzJeA5WunOxsQzswCgYIKoZIzj0EAwIw
YDELMAkGA1UEBhMCVVMxCzAJBgNVBAgMAk5ZMQwwCgYDVQQHDANOWUMxEjAQBgNV
BAoMCUZvckZhYnJpYzEOMAwGA1UECwwFVGVzdHMxEjAQBgNVBAMMCXVuaXQudGVz
dDAeFw0yNTEwMjgxODM4MjNaFw0yNjEwMjgxODM4MjNaMGAxCzAJBgNVBAYTAlVT
MQswCQYDVQQIDAJOWTEMMAoGA1UEBwwDTllDMRIwEAYDVQQKDAlGb3JGYWJyaWMx
DjAMBgNVBAsMBVRlc3RzMRIwEAYDVQQDDAl1bml0LnRlc3QwWTATBgcqhkjOPQIB
BggqhkjOPQMBBwNCAASKdZWLsjc9u4y1yxSCSVL9yw2xq9+hflywLH3d4ohc51TX
dnRh78x5VapoLy76faiCv6Dcyf3YJte0ZJ2bHpC3o1MwUTAdBgNVHQ4EFgQUtlNF
1TWmAiAy6UcEIGoTo/FWtcYwHwYDVR0jBBgwFoAUtlNF1TWmAiAy6UcEIGoTo/FW
tcYwDwYDVR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiA5LOwZ8SVjgcbR
ZAyLbI1P+7QoBI78xACsMKL+NHb6AAIhAOHuueJBlvB3YmyDYXViPNh8H1VK+IgZ
aNUApmLEXF+k
-----END CERTIFICATE-----`;

  let workspace: string;

  beforeAll(async () => {
    workspace = await fs.mkdtemp(join(tmpdir(), "coreutils-"));
  });

  afterAll(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("readFile returns buffers for file paths and preserves buffers", async () => {
    const filePath = join(workspace, "sample.txt");
    await fs.writeFile(filePath, "hello");

    const fileContent = await CoreUtils.readFile(filePath);
    expect(fileContent.toString()).toBe("hello");

    const buffer = Buffer.from("world");
    expect(await CoreUtils.readFile(buffer)).toBe(buffer);
  });

  it("getIdentity loads certificate from path or raw content", async () => {
    const certDir = join(workspace, "certs");
    await fs.mkdir(certDir);
    await fs.writeFile(join(certDir, "cert.pem"), certificatePem);

    const identityFromPath = await CoreUtils.getIdentity("Org1MSP", certDir);
    expect(identityFromPath.mspId).toBe("Org1MSP");
    expect(Buffer.from(identityFromPath.credentials).toString()).toContain(
      "BEGIN CERTIFICATE"
    );

    const identityFromContent = await CoreUtils.getIdentity(
      "Org1MSP",
      certificatePem
    );
    expect(Buffer.from(identityFromContent.credentials).toString()).toContain(
      "BEGIN CERTIFICATE"
    );
  });

  it("getFirstDirFileName and getFirstDirFileNameContent return file details", async () => {
    const dir = join(workspace, "single");
    await fs.mkdir(dir);
    const filePath = join(dir, "content.txt");
    await fs.writeFile(filePath, "payload");

    expect(await CoreUtils.getFirstDirFileName(dir)).toBe(filePath);
    expect(await CoreUtils.getFirstDirFileNameContent(dir)).toBe("payload");
  });

  it("getSigner extracts private key and delegates to fabric signers", async () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const privateKeyPem = privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();

    await CoreUtils.getSigner(privateKeyPem);

    expect(signerMock).toHaveBeenCalledTimes(1);
  });

  it("getCAUser builds a user with enrollment data", async () => {
    const user = await CoreUtils.getCAUser(
      "appUser",
      "PRIVATE_KEY",
      certificatePem,
      "Org1MSP"
    );

    expect(user.name).toBe("appUser");
    expect(newCryptoSuiteMock).toHaveBeenCalledTimes(1);
    expect(createKeyFromRawMock).toHaveBeenCalledWith("PRIVATE_KEY");
    expect(setCryptoSuiteMock).toHaveBeenCalled();
    expect(setEnrollmentMock).toHaveBeenCalledWith(
      "importedKey",
      certificatePem,
      "Org1MSP"
    );
  });
});
