import "reflect-metadata";

import {
  HFCAIdentityAttributes,
  HFCAIdentityType,
} from "../../src/client/services/FabricEnrollmentService";
import type {
  CertificateResponse,
  FabricIdentity,
  GetCertificatesRequest,
} from "../../src/shared/fabric-types";
import "../../src/shared/fabric-types";

describe("shared/fabric-types", () => {
  it("exports enrollment enums and typed helpers", () => {
    const identity: FabricIdentity = {
      id: "user1",
      type: HFCAIdentityType.USER,
      affiliation: "org1.department1",
      attrs: [{ name: HFCAIdentityAttributes.HFREVOKER, value: "true" }],
      max_enrollments: 1,
    };

    expect(identity.attrs[0].name).toBe(HFCAIdentityAttributes.HFREVOKER);

    const request: GetCertificatesRequest = { id: "user1", notrevoked: true };
    const response: CertificateResponse = {
      caname: "Org1CA",
      certs: [{ PEM: "-----BEGIN CERTIFICATE-----" }],
    };

    expect(request.notrevoked).toBe(true);
    expect(response.certs[0].PEM).toContain("CERTIFICATE");
  });
});
