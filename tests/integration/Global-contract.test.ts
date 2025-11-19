import { execSync } from "child_process";
import {
  commitChaincode,
  deployContract,
  ensureInfrastructureBooted,
} from "../utils";
import fs from "fs";
import path from "path";

describe("Tests global contract implementation", () => {
  const contractFolderName = "global";
  const contractName = "global";

  beforeAll(async () => {
    // Boot infrastructure for testing
    execSync(`npm run infrastructure:up`);

    // Ensure Infrastructure is ready
    await ensureInfrastructureBooted();

    execSync("npm run build:contract");

    const location = path.join(
      __dirname,
      "../../docker/infrastructure/chaincode",
      contractFolderName
    );

    if (!fs.existsSync(location)) {
      execSync(
        `cp -r  ${path.join(__dirname, "../..", contractFolderName)} ${path.join(__dirname, "../../docker/infrastructure/chaincode")}/`
      );
      deployContract(contractFolderName, contractName);
      commitChaincode(contractName);
    }

    // Copy client config to local directory for testing purposes
    execSync(`docker cp org-a:/weaver/client/. docker/docker-data`);
  });

  it("tests", async () => {
    console.log("test");
  });
});
