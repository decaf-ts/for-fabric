import { execSync } from "child_process";
import * as path from "path";

import {
  commitChaincode,
  deployContract,
  ensureInfrastructureBooted,
} from "../utils/utils";

jest.setTimeout(5000000);

describe("Test PTP", () => {
  console.log("Folder from env: " + process.env.CONTRACT_FOLDER);
  console.log(process.env.CONTRACT_NAME);
  console.log(process.env.CONTRACT_UPDATE);
  const contractFolderName = process.env.CONTRACT_FOLDER || "ptp-contract";
  const contractName = process.env.CONTRACT_NAME || "ptp-contract";
  const updateContract = Boolean(process.env.CONTRACT_UPDATE);

  it("ensures infrastructure is booted", async () => {
    await ensureInfrastructureBooted();
  });

  if (updateContract)
    it(`Deploys/updates the context ${contractName} in folder ${contractFolderName}`, async () => {
      execSync(`npm run update:contracts`, {
        cwd: path.join(__dirname, "../../../"),
        env: { ...process.env, CONTRACT_NAME: contractName },
      });
      deployContract(contractFolderName, contractName);
      commitChaincode(contractName);
    });

  it("copies the crypto materials", () => {
    // Copy client config to local directory for testing purposes
    execSync(`docker cp org-a:/weaver/client/. docker/docker-data`, {
      stdio: "inherit",
      cwd: process.cwd(),
    });
  });
});
