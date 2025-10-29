import "reflect-metadata";

import { IdentityType } from "../../src/shared/constants";
import { Identity } from "../../src/shared/model/Identity";
import { IdentityCredentials } from "../../src/shared/model/IdentityCredentials";

describe("shared/model", () => {
  it("creates identity credentials with required properties", () => {
    const creds = new IdentityCredentials({
      id: "cred1",
      certificate: "cert",
      rootCertificate: "root",
      privateKey: "key",
    });

    expect(creds.id).toBe("cred1");
    expect(creds.certificate).toBe("cert");
    expect(creds.rootCertificate).toBe("root");
    expect(creds.privateKey).toBe("key");
  });

  it("creates identity with credentials and default type", () => {
    const creds = new IdentityCredentials({
      id: "cred1",
      certificate: "cert",
      rootCertificate: "root",
      privateKey: "key",
    });

    const identity = new Identity({
      id: "user1",
      mspId: "Org1MSP",
      credentials: creds,
    });

    expect(identity.id).toBe("user1");
    expect(identity.mspId).toBe("Org1MSP");
    expect(identity.credentials).toEqual(
      expect.objectContaining({
        id: "cred1",
        certificate: "cert",
        rootCertificate: "root",
        privateKey: "key",
      })
    );
    expect(identity.type).toBe(IdentityType.X509);
  });
});
