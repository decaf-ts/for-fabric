import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { Credentials, CAConfig, PeerConfig } from "../../src/shared/types";
import { FabricEnrollmentService } from "../../src/client/services";
import { FabricClientAdapter } from "../../src/client/FabricClientAdapter";
import { Identity } from "../../src/shared/model/Identity";
import { FabricERC20ClientRepository } from "../../src/contracts/erc20/erc20Repository";
import {
  commitChaincode,
  compileContract,
  deployContract,
  ensureInfrastructureBooted,
} from "../utils";
import { TestERC20Contract } from "../assets/contract/erc-20-contract/TestERC20Contract";
import { ERC20Token } from "../../src/contracts/erc20/models";
import { AuthorizationError } from "@decaf-ts/core";

jest.setTimeout(5000000);

describe("Test ERC20", () => {
  const contractFolderName = "erc-20-contract";
  const contractName = TestERC20Contract.name;

  const user: Credentials = {
    userName: "TestUser" + Date.now(),
    password: "TestUserPSW",
  };

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

  let peerConfig: PeerConfig;

  let userID: Identity;
  let clientAdapter: FabricClientAdapter;
  let enrollmentService: FabricEnrollmentService;
  let TestERC20ModelRepository: FabricERC20ClientRepository;
  let testToken: ERC20Token;

  beforeAll(async () => {
    //Boot infrastructure for testing
    execSync(`npm run infrastructure:up`);

    //Ensure Infrastructure is ready
    await ensureInfrastructureBooted();

    // Check if contract folder exists and compile it if not
    if (
      fs.existsSync(
        path.join(
          __dirname,
          "../../docker/infrastructure/chaincode",
          contractFolderName
        )
      )
    ) {
      console.log("Contract folder already exists");
    } else {
      // Compile contract
      compileContract(contractFolderName);

      //Deploy contract
      deployContract(contractFolderName, contractName);

      // Commit Chaincode
      commitChaincode(contractName);
    }

    // Copy client config to local directory for testing purposes
    execSync(`docker cp org-a:/weaver/client/. docker/docker-data`);

    peerConfig = {
      cryptoPath: "./docker/infrastructure/crypto-config",
      keyCertOrDirectoryPath: "./docker/docker-data/admin/msp/keystore",
      certCertOrDirectoryPath: "./docker/docker-data/admin/msp/signcerts",
      tlsCert: fs.readFileSync("./docker/docker-data/tls-ca-cert.pem"),
      peerEndpoint: "localhost:7031",
      peerHostAlias: "localhost",
      chaincodeName: contractName,
      ca: "org-a",
      mspId: "Peer0OrgaMSP",
      channel: "simple-channel",
    };

    clientAdapter = new FabricClientAdapter(peerConfig);
    TestERC20ModelRepository = new FabricERC20ClientRepository(clientAdapter);

    testToken = new ERC20Token({
      name: "TestToken",
      symbol: "TST",
      decimals: 10,
    });
  });

  it("register and enroll new user ", async () => {
    enrollmentService = new FabricEnrollmentService(caConfig);
    userID = await enrollmentService.registerAndEnroll(
      user,
      false,
      "",
      "client"
    );
    expect(userID.id).toBeDefined();
  });

  it("Initialize the new Test Token as admin", async () => {
    await TestERC20ModelRepository.initialize(testToken);
  });

  it("Gets token name", async () => {
    const tokenName = await TestERC20ModelRepository.tokenName();
    expect(tokenName).toBe(testToken.name);
  });

  it("Gets token symbol", async () => {
    const tokenSymbol = await TestERC20ModelRepository.symbol();
    expect(tokenSymbol).toBe(testToken.symbol);
  });

  it("Gets token decimals", async () => {
    const tokenDecimals = await TestERC20ModelRepository.decimals();
    expect(tokenDecimals).toBe(testToken.decimals);
  });

  it("Mints new tokens", async () => {
    await TestERC20ModelRepository.mint(1000000);
  });

  it("Fails to mint with not authorized user", async () => {
    const clientConfig = {
      keyDirectoryPath: Buffer.from(userID.credentials!.privateKey!),
      certDirectoryPath: Buffer.from(userID.credentials!.certificate!),
    };

    const clientTestERC20ModelRepository = TestERC20ModelRepository.for(
      clientConfig
    ) as FabricERC20ClientRepository;

    try {
      await clientTestERC20ModelRepository.mint(1000000); // This should fail
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
    }
  });
});
