import { Credentials, CAConfig } from "../../src/shared/types";
import { FabricEnrollmentService } from "../../src/shared/services";
import { CA_ROLE } from "../../src/shared/services/constants";
import { Identity } from "../../src/shared/model/Identity";

jest.setTimeout(5000000);

describe("Test enrollement", () => {
  const user: Credentials = {
    userName: "TestUser",
    password: "TestUserPSW",
  };

  const caConfig: CAConfig = {
    url: "https://org-a:7011",
    tls: {
      trustedRoots: [
        "docker/infrastructure/storage/org-a-peer-0-vol/client/tls-msp/tlscacerts",
      ],
      verify: false,
    },
    caName: "org-a ",
    caCert: "docker/infrastructure/storage/org-a-server-vol",
    caKey:
      "docker/infrastructure/storage/org-a-server-vol/msp/keystore/70e1827a1525139e8a02e304bd020ff89742a492cc94864fafbdf3593db0b604_sk",
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
