import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { convertToMS } from "../utils";

jest.setTimeout(convertToMS(90));

// Each organization is onboarded by running the fabric-only onboarding setup
// with its own env file. The env file is selected via ONBOARD_ENV_FILE.
const orgs = (
  process.env.ONBOARD_ORGS || ".env.onboard.orgb,.env.onboard.orgc"
).split(",");

const SETUP_PATTERN =
  "Onboard Partner (Boot Infrastructure|Channel|Stop Idle Containers|Deploy Contract|Update Image Contract)";

function onboardOrg(envFile: string, onboarded: string) {
  const envFilePath = path.join(
    __dirname,
    "../environment",
    path.basename(envFile)
  );
  const orgName = /^ORG_NAME=(\S+)$/m.exec(
    fs.readFileSync(envFilePath, "utf8")
  )![1];

  const command =
    `npx jest ./tests/infrastructure/onboard-org.setup.ts ` +
    `--testNamePattern="${SETUP_PATTERN}" ` +
    `--bail=1 --runInBand --config=./jest.config.cjs`;

  execSync(command, {
    stdio: "inherit",
    env: {
      ...process.env,
      ONBOARD_ENV_FILE: envFile,
      // Orgs onboarded before this one: the onboarding flow bumps the
      // chaincode sequence and needs their MSPs for approvals/commit.
      ONBOARDED_ORGS: onboarded,
    },
  });

  // Guard against the setup silently matching no tests.
  const runningPeer = execSync(
    `docker ps --filter "name=${orgName}-peer-0" --filter "status=running" --quiet`,
    { encoding: "utf8" }
  ).trim();

  if (!runningPeer) {
    throw new Error(
      `Onboarding of organization ${orgName} did not leave a running peer-0 container.`
    );
  }
}

describe("Setup E2E", () => {
  it("Onboards Organizations", () => {
    const onboarded: string[] = [];
    for (const envFile of orgs) {
      onboardOrg(envFile.trim(), onboarded.join(","));
      onboarded.push(envFile.trim());
    }
  });
});
