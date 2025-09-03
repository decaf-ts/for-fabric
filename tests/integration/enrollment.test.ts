import { Credentials, CAConfig } from "../../src/shared/types";
import { FabricEnrollmentService } from "../../src/shared/services";
import { Identity } from "../../src/shared/model/Identity";

jest.setTimeout(5000000);

describe("Test enrollement", () => {
  const user: Credentials = {
    userName: "TestUser",
    password: "TestUserPSW",
  };

  // const admin: Credentials = {
  //   userName: "admin",
  //   password: "admin",
  // };

  const caConfig: CAConfig = {
    url: "https://localhost:7011",
    tls: {
      trustedRoots: [
        "for-fabric/tests/docker-data/org-a-peer-0-vol/msp/tlscacerts",
      ],
      verify: true,
    },
    caName: "org-a",
    caCert: "for-fabric/tests/docker-data/org-a-peer-0-vol/msp/cacerts",
    caKey: "for-fabric/tests/docker-data/org-a-peer-0-vol/msp/keystore",
  };

  beforeAll(async () => {});

  it("register and enroll ", async () => {
    let enrollmentService: FabricEnrollmentService;
    let userID: Identity;
    try {
      enrollmentService = new FabricEnrollmentService(caConfig);
      userID = await enrollmentService.registerAndEnroll(
        user,
        false,
        "",
        "user"
      );
    } catch (e: any) {
      console.log(e);
    }
    console.log("done");
  });
});
