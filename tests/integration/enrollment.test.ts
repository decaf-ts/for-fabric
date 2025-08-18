import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { Credentials,CAConfig } from "../../src/shared/types";
import {FabricEnrollmentService} from "../../src/shared/services"
import { caConfig } from "../assets/ca-config";

jest.setTimeout(5000000);

describe.skip("Test enrollement", () => {
  const user: Credentials = {
    userName: "TestUser",
    password: "TestUserPSW",
  };


  beforeAll(async () => {});

  it("register and enroll ", () => {
    FabricEnrollmentService.
  });
});
