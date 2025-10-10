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
import { CryptoUtils } from "../../src/shared/crypto";

jest.setTimeout(5000000);

describe("Test ERC20", () => {
  const contractFolderName = "erc-20-contract";
  const contractName = TestERC20Contract.name;

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

  let user: Credentials;
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

    user = {
      userName: "TestUser" + Date.now(),
      password: "TestUserPSW",
    };
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

  it("Mints new tokens - Positive", async () => {
    await TestERC20ModelRepository.mint(1000000);
  });

  it("Mints new token - Negative ( with unauthorized user )", async () => {
    const clientConfig = {
      keyCertOrDirectoryPath: Buffer.from(userID.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID.credentials!.certificate!),
    };

    const clientTestERC20ModelRepository = TestERC20ModelRepository.for(
      clientConfig
    ) as FabricERC20ClientRepository;

    try {
      await clientTestERC20ModelRepository.mint(1000000); // This should fail
    } catch (e: any) {
      if (e.message.includes("AuthorizationError")) {
        console.log("Authorization Error occurred as expected");
      } else {
        throw new Error("Unexpected error occurred: " + e);
      }
    }
  });

  it("Burn tokens - Positive", async () => {
    await TestERC20ModelRepository.burn(500000);
  });

  it("Burn tokens - Negative", async () => {
    const clientConfig = {
      keyCertOrDirectoryPath: Buffer.from(userID.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID.credentials!.certificate!),
    };

    const clientTestERC20ModelRepository = TestERC20ModelRepository.for(
      clientConfig
    ) as FabricERC20ClientRepository;

    try {
      await clientTestERC20ModelRepository.burn(50000); // This should fail
    } catch (e: any) {
      if (e.message.includes("AuthorizationError")) {
        console.log("Authorization Error occurred as expected");
      } else {
        throw new Error("Unexpected error occurred: " + e);
      }
    }
  });

  it("Transfer tokens from admin to client", async () => {
    const client: Credentials = {
      userName: "TestUser" + Date.now(),
      password: "TestUserPSW",
    };
    enrollmentService = new FabricEnrollmentService(caConfig);
    const clientID = await enrollmentService.registerAndEnroll(
      client,
      false,
      "",
      "client"
    );
    expect(userID.id).toBeDefined();
    await TestERC20ModelRepository.transfer(
      CryptoUtils.decode(clientID.id!),
      500
    );

    const balance = await TestERC20ModelRepository.balanceOf(
      CryptoUtils.decode(clientID.id!)
    );
    expect(balance).toBe(500);
  });

  it("Get client id", async () => {
    const clientConfig = {
      keyCertOrDirectoryPath: Buffer.from(userID.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID.credentials!.certificate!),
    };

    const clientTestERC20ModelRepository = TestERC20ModelRepository.for(
      clientConfig
    ) as FabricERC20ClientRepository;

    const clientID = await clientTestERC20ModelRepository.clientAccountID();
    expect(clientID).toBeDefined();
    expect(clientID).toEqual(CryptoUtils.decode(userID.id!));
  });

  it("Get client balance", async () => {
    const user: Credentials = {
      userName: "TestUser" + Date.now(),
      password: "TestUserPSW",
    };
    enrollmentService = new FabricEnrollmentService(caConfig);
    const userID = await enrollmentService.registerAndEnroll(
      user,
      false,
      "",
      "client"
    );

    await TestERC20ModelRepository.transfer(
      CryptoUtils.decode(userID.id!),
      500
    );

    const balance = await TestERC20ModelRepository.balanceOf(
      CryptoUtils.decode(userID.id!)
    );
    expect(balance).toBe(500);

    const clientConfig = {
      keyCertOrDirectoryPath: Buffer.from(userID.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID.credentials!.certificate!),
    };

    const clientTestERC20ModelRepository = TestERC20ModelRepository.for(
      clientConfig
    ) as FabricERC20ClientRepository;

    const clientBalance =
      await clientTestERC20ModelRepository.clientAccountBalance();
    expect(clientBalance).toBeDefined();
    expect(clientBalance).toEqual(500);
  });

  it("Transfer tokens between clients", async () => {
    enrollmentService = new FabricEnrollmentService(caConfig);

    const user1: Credentials = {
      userName: "TestUser" + Date.now(),
      password: "TestUserPSW",
    };
    const userID1 = await enrollmentService.registerAndEnroll(
      user1,
      false,
      "",
      "client"
    );

    const clientConfig1 = {
      keyCertOrDirectoryPath: Buffer.from(userID1.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID1.credentials!.certificate!),
    };

    await TestERC20ModelRepository.transfer(
      CryptoUtils.decode(userID1.id!),
      500
    );

    const user2: Credentials = {
      userName: "TestUser" + Date.now(),
      password: "TestUserPSW",
    };
    const userID2 = await enrollmentService.registerAndEnroll(
      user2,
      false,
      "",
      "client"
    );

    const clientConfig2 = {
      keyCertOrDirectoryPath: Buffer.from(userID2.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID2.credentials!.certificate!),
    };

    const clientTestERC20ModelRepository1 = TestERC20ModelRepository.for(
      clientConfig1
    ) as FabricERC20ClientRepository;

    await clientTestERC20ModelRepository1.transfer(
      CryptoUtils.decode(userID2.id!),
      500
    );

    const clientTestERC20ModelRepository2 = TestERC20ModelRepository.for(
      clientConfig2
    ) as FabricERC20ClientRepository;

    const clientBalance =
      await clientTestERC20ModelRepository2.clientAccountBalance();
    expect(clientBalance).toBeDefined();
    expect(clientBalance).toEqual(500);
  });

  it("Fail to transfer because of insuficient funds", async () => {
    enrollmentService = new FabricEnrollmentService(caConfig);

    const user1: Credentials = {
      userName: "TestUser" + Date.now(),
      password: "TestUserPSW",
    };
    const userID1 = await enrollmentService.registerAndEnroll(
      user1,
      false,
      "",
      "client"
    );

    const clientConfig1 = {
      keyCertOrDirectoryPath: Buffer.from(userID1.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID1.credentials!.certificate!),
    };

    await TestERC20ModelRepository.transfer(
      CryptoUtils.decode(userID1.id!),
      500
    );

    const clientTestERC20ModelRepository1 = TestERC20ModelRepository.for(
      clientConfig1
    ) as FabricERC20ClientRepository;

    try {
      await clientTestERC20ModelRepository1.transfer(
        CryptoUtils.decode(userID.id!),
        1000
      );
    } catch (e: any) {
      if (e.message.includes("BalanceError")) {
        console.log("Insufficient funds error occurred as expected");
      } else {
        throw new Error("Unexpected error occurred: " + e);
      }
    }

    await TestERC20ModelRepository.transfer(
      CryptoUtils.decode(userID1.id!),
      500
    );

    try {
      await clientTestERC20ModelRepository1.transfer(
        CryptoUtils.decode(userID.id!),
        600
      );
    } catch (e: any) {
      if (e.message.includes("BalanceError")) {
        console.log("Insufficient funds error occurred as expected");
      } else {
        throw new Error("Unexpected error occurred: " + e);
      }
    }
  });

  it("Get total supply", async () => {
    const totalSupply = await TestERC20ModelRepository.totalSupply();
    expect(totalSupply).toBeGreaterThan(50000);
  });

  it("Burn from client", async () => {
    enrollmentService = new FabricEnrollmentService(caConfig);

    const user1: Credentials = {
      userName: "TestUser" + Date.now(),
      password: "TestUserPSW",
    };
    const userID1 = await enrollmentService.registerAndEnroll(
      user1,
      false,
      "",
      "client"
    );

    await TestERC20ModelRepository.transfer(
      CryptoUtils.decode(userID1.id!),
      1000
    );

    const balance = await TestERC20ModelRepository.balanceOf(
      CryptoUtils.decode(userID1.id!)
    );
    expect(balance).toBe(1000);

    await TestERC20ModelRepository.burnFrom(
      CryptoUtils.decode(userID1.id!),
      500
    );

    const balanceAfterBurn = await TestERC20ModelRepository.balanceOf(
      CryptoUtils.decode(userID1.id!)
    );
    expect(balanceAfterBurn).toBe(500);
  });

  it("Allowance workflow - Positive", async () => {
    const adminID = await TestERC20ModelRepository.clientAccountID();
    expect(adminID).toBeDefined();

    enrollmentService = new FabricEnrollmentService(caConfig);

    const user1: Credentials = {
      userName: "TestUser" + Date.now(),
      password: "TestUserPSW",
    };
    const userID1 = await enrollmentService.registerAndEnroll(
      user1,
      false,
      "",
      "client"
    );

    const user2: Credentials = {
      userName: "TestUser" + Date.now(),
      password: "TestUserPSW",
    };
    const userID2 = await enrollmentService.registerAndEnroll(
      user2,
      false,
      "",
      "client"
    );

    await TestERC20ModelRepository.transfer(
      CryptoUtils.decode(userID1.id!),
      1000
    );

    const clientConfig1 = {
      keyCertOrDirectoryPath: Buffer.from(userID1.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID1.credentials!.certificate!),
    };

    const clientTestERC20ModelRepository1 = TestERC20ModelRepository.for(
      clientConfig1
    ) as FabricERC20ClientRepository;

    const approve = await clientTestERC20ModelRepository1.approve(adminID, 500);
    expect(approve).toBe(true);

    const allowance = await TestERC20ModelRepository.allowance(
      CryptoUtils.decode(userID1.id!),
      adminID
    );
    expect(allowance).toBe(500);

    const transferFrom = await TestERC20ModelRepository.transferFrom(
      CryptoUtils.decode(userID1.id!),
      CryptoUtils.decode(userID2.id!),
      200
    );
    expect(transferFrom).toBe(true);

    const clientConfig2 = {
      keyCertOrDirectoryPath: Buffer.from(userID2.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID2.credentials!.certificate!),
    };

    const clientTestERC20ModelRepository2 = TestERC20ModelRepository.for(
      clientConfig2
    ) as FabricERC20ClientRepository;

    const balanceAfterTransfer =
      await clientTestERC20ModelRepository2.clientAccountBalance();

    expect(balanceAfterTransfer).toBe(200);
  });

  it("Allowance workflow - Negative (owner doesn't have sufficient funds )", async () => {
    const adminID = await TestERC20ModelRepository.clientAccountID();
    expect(adminID).toBeDefined();

    enrollmentService = new FabricEnrollmentService(caConfig);

    const user1: Credentials = {
      userName: "TestUser" + Date.now(),
      password: "TestUserPSW",
    };
    const userID1 = await enrollmentService.registerAndEnroll(
      user1,
      false,
      "",
      "client"
    );

    await TestERC20ModelRepository.transfer(
      CryptoUtils.decode(userID1.id!),
      500
    );

    const clientConfig1 = {
      keyCertOrDirectoryPath: Buffer.from(userID1.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID1.credentials!.certificate!),
    };

    const clientTestERC20ModelRepository1 = TestERC20ModelRepository.for(
      clientConfig1
    ) as FabricERC20ClientRepository;
    try {
      await clientTestERC20ModelRepository1.approve(adminID, 10000);
    } catch (e: any) {
      if (e.message.includes("BalanceError")) {
        console.log("Insufficient funds error occurred as expected");
      } else {
        throw new Error("Unexpected error occurred: " + e);
      }
    }
  });

  it("Allowance workflow - Negative ( there is no allowance )", async () => {
    const adminID = await TestERC20ModelRepository.clientAccountID();
    expect(adminID).toBeDefined();

    enrollmentService = new FabricEnrollmentService(caConfig);

    const user1: Credentials = {
      userName: "TestUser" + Date.now(),
      password: "TestUserPSW",
    };
    const userID1 = await enrollmentService.registerAndEnroll(
      user1,
      false,
      "",
      "client"
    );

    await TestERC20ModelRepository.transfer(
      CryptoUtils.decode(userID1.id!),
      500
    );
    try {
      await TestERC20ModelRepository.transferFrom(
        CryptoUtils.decode(userID1.id!),
        adminID,
        500
      );
    } catch (e: any) {
      if (
        e.message.includes("AllowanceError") &&
        e.message.includes("no allowance")
      ) {
        console.log("No allowance error occurred as expected");
      } else {
        throw new Error("Unexpected error occurred: " + e);
      }
    }
  });

  it("Allowance workflow - Negative ( unsuficient allowance )", async () => {
    const adminID = await TestERC20ModelRepository.clientAccountID();
    expect(adminID).toBeDefined();

    enrollmentService = new FabricEnrollmentService(caConfig);

    const user1: Credentials = {
      userName: "TestUser" + Date.now(),
      password: "TestUserPSW",
    };
    const userID1 = await enrollmentService.registerAndEnroll(
      user1,
      false,
      "",
      "client"
    );

    await TestERC20ModelRepository.transfer(
      CryptoUtils.decode(userID1.id!),
      500
    );

    const clientConfig1 = {
      keyCertOrDirectoryPath: Buffer.from(userID1.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID1.credentials!.certificate!),
    };

    const clientTestERC20ModelRepository1 = TestERC20ModelRepository.for(
      clientConfig1
    ) as FabricERC20ClientRepository;

    const approve = await clientTestERC20ModelRepository1.approve(adminID, 500);
    expect(approve).toBe(true);

    try {
      await TestERC20ModelRepository.transferFrom(
        CryptoUtils.decode(userID1.id!),
        adminID,
        1000
      );
    } catch (e: any) {
      if (e.message.includes("BalanceError")) {
        console.log("Insufficient funds error occurred as expected");
      } else {
        throw new Error("Unexpected error occurred: " + e);
      }
    }
  });

  it("Allowance workflow - Negative ( user spends before spender makes the transaction )", async () => {
    const adminID = await TestERC20ModelRepository.clientAccountID();
    expect(adminID).toBeDefined();

    enrollmentService = new FabricEnrollmentService(caConfig);

    const user1: Credentials = {
      userName: "TestUser" + Date.now(),
      password: "TestUserPSW",
    };
    const userID1 = await enrollmentService.registerAndEnroll(
      user1,
      false,
      "",
      "client"
    );

    await TestERC20ModelRepository.transfer(
      CryptoUtils.decode(userID1.id!),
      500
    );

    const clientConfig1 = {
      keyCertOrDirectoryPath: Buffer.from(userID1.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID1.credentials!.certificate!),
    };

    const clientTestERC20ModelRepository1 = TestERC20ModelRepository.for(
      clientConfig1
    ) as FabricERC20ClientRepository;

    const approve = await clientTestERC20ModelRepository1.approve(adminID, 500);
    expect(approve).toBe(true);

    const transfer = await clientTestERC20ModelRepository1.transfer(
      adminID,
      200
    );
    expect(transfer).toBe(true);

    try {
      await TestERC20ModelRepository.transferFrom(
        CryptoUtils.decode(userID1.id!),
        adminID,
        300
      );
    } catch (e: any) {
      if (e.message.includes("BalanceError")) {
        console.log("Insufficient funds error occurred as expected");
      } else {
        throw new Error("Unexpected error occurred: " + e);
      }
    }
  });
});
