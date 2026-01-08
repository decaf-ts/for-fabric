import { Service, service } from "@decaf-ts/core";
import { CAConfig } from "../../src/shared/index";
import { FabricIdentityService } from "../../src/client/index";
import { execSync } from "child_process";

const caConfig: CAConfig = {
  url: "https://localhost:7011",
  tls: {
    trustedRoots: ["./docker/docker-data/tls-ca-cert.pem"],
    verify: true,
  },
  caName: "org-a",
  caCert: "./docker/docker-data/admin/msp/signcerts",
  caKey: "./docker/docker-data/admin/msp/keystore",
};

const mokFn = jest.fn();
const mockRes = jest.fn();
@service("Identity")
class ExtendedFabricIdentityService extends FabricIdentityService {
  constructor() {
    super();
  }

  override async initialize(
    ...args: any[]
  ): Promise<{ config: CAConfig; client: any }> {
    mokFn(...args);
    const result = await super.initialize(caConfig, ...args);
    mockRes(result);
    return result;
  }
}

describe("IdentityService", () => {
  let service: ExtendedFabricIdentityService;

  beforeAll(async () => {
    execSync(`docker cp org-a:/weaver/client/. docker/docker-data`, {
      stdio: "inherit",
    });

    await Service.boot();
    service = Service.get("Identity") as ExtendedFabricIdentityService;
  });

  it("should initialize FabricIdentityService", async () => {
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(ExtendedFabricIdentityService);
    expect(mokFn).toBeCalledTimes(1);
    expect(mockRes).toBeCalledTimes(1);
  });

  it("should enroll a new user", async () => {
    const client = service.client;
    expect(client).toBeDefined();
  });
});
