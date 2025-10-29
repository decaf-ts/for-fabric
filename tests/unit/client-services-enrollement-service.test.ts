import "reflect-metadata";

import { ConflictError } from "@decaf-ts/db-decorators";
import { AuthorizationError } from "@decaf-ts/core";
import { Identity } from "../../src/shared/model/Identity";
import { IdentityType } from "../../src/shared/constants";
import { FabricEnrollmentService } from "../../src/client/services/enrollementService";
import { RegistrationError } from "../../src/shared/errors";

const CERTIFICATE = `-----BEGIN CERTIFICATE-----
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

class TestEnrollmentService extends FabricEnrollmentService {
  public exposeParseError(error: Error) {
    return this.parseError(error);
  }

  public static exposeIdentityFromEnrollment(
    enrollment: any,
    mspId: string
  ): Identity {
    return this.identityFromEnrollment(enrollment, mspId);
  }
}

const CONFIG = {
  url: "https://ca.example.com",
  caName: "Org1CA",
  caCert: "/tmp/cert",
  caKey: "/tmp/key",
};

describe("FabricEnrollmentService helpers", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("parses CA error responses into specialized errors", () => {
    const service = new TestEnrollmentService(CONFIG);

    expect(
      service.exposeParseError(
        new Error('failed with code: 74 message: "duplicate identity"')
      )
    ).toBeInstanceOf(ConflictError);

    expect(
      service.exposeParseError(
        new Error('failed with code: 20 message: "not allowed"')
      )
    ).toBeInstanceOf(AuthorizationError);

    expect(
      service.exposeParseError(new Error("unmatched error"))
    ).toBeInstanceOf(RegistrationError);
  });

  it("builds identity models from enrollment responses", () => {
    const enrollment = {
      certificate: CERTIFICATE,
      key: { toBytes: () => Buffer.from("private-key") },
      rootCertificate: CERTIFICATE,
    };

    const identity = TestEnrollmentService.exposeIdentityFromEnrollment(
      enrollment,
      "Org1MSP"
    );

    expect(identity).toBeInstanceOf(Identity);
    expect(identity.mspId).toBe("Org1MSP");
    expect(identity.type).toBe(IdentityType.X509);
    expect(identity.credentials?.certificate).toContain("BEGIN CERTIFICATE");
  });

  it("registers and enrolls identities sequentially", async () => {
    const service = new TestEnrollmentService(CONFIG);
    const registerSpy = jest
      .spyOn(service, "register")
      .mockResolvedValue("secret");
    const expectedIdentity = new Identity({
      id: "user1",
      mspId: "Org1MSP",
      type: IdentityType.X509,
    });
    const enrollSpy = jest
      .spyOn(service, "enroll")
      .mockResolvedValue(expectedIdentity);

    const identity = await service.registerAndEnroll(
      { userName: "user1", password: "pw" },
      false,
      "org1.department1",
      "client"
    );

    expect(identity).toBe(expectedIdentity);
    expect(registerSpy).toHaveBeenCalledWith(
      { userName: "user1", password: "pw" },
      false,
      "org1.department1",
      "client",
      undefined,
      undefined
    );
    expect(enrollSpy).toHaveBeenCalledWith("user1", "secret");
  });
});
