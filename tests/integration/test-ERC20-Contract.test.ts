import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { Credentials, CAConfig, PeerConfig } from "../../src/shared/types";
import { FabricEnrollmentService } from "../../src/client";
import { FabricClientAdapter } from "../../src/client";
import { Identity } from "../../src/shared/model/Identity";
import { FabricERC20ClientRepository } from "../../src/client/erc20/FabricERC20ClientRepository";
import {
  commitChaincode,
  compileContract,
  deployContract,
  ensureInfrastructureBooted,
  nextChaincodeSequence,
} from "../utils";
import { TestERC20Contract } from "../assets/contract/erc-20-contract/TestERC20Contract";
import { ERC20Token } from "../../src/contracts/erc20/models";
import { CryptoUtils } from "../../src/client/crypto";
import { Observer } from "@decaf-ts/core";
import { ERC20Events } from "../../src/shared/erc20/erc20-constants";

jest.setTimeout(5000000);

describe("Test ERC20", () => {
  const contractFolderName = "erc-20-contract";
  const contractName = TestERC20Contract.name;
  const chaincodeName = `${contractName}-${Date.now()}`;
  const adapterAlias = "hlf-fabric-test-erc20";

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
  let testERC20ModelRepository: FabricERC20ClientRepository;
  let testToken: ERC20Token;
  let adminID: string;
  let observer: Observer;
  let mock: any;

  beforeAll(async () => {
    //Boot infrastructure for testing
    execSync(`npm run infrastructure:up`);

    //Ensure Infrastructure is ready
    await ensureInfrastructureBooted();

    // Check if contract folder exists and compile it if not
    // Compile contract
    compileContract(contractFolderName);

    const sequence = nextChaincodeSequence(chaincodeName);
    const version = `${Date.now()}`;

    //Deploy contract
    deployContract(contractFolderName, chaincodeName, sequence, version);

    // Commit Chaincode
    commitChaincode(chaincodeName, sequence, version);

    // Copy client config to local directory for testing purposes
    execSync(`docker cp org-a:/weaver/client/. docker/docker-data`);

    peerConfig = {
      cryptoPath: "./docker/infrastructure/crypto-config",
      keyCertOrDirectoryPath: "./docker/docker-data/admin/msp/keystore",
      certCertOrDirectoryPath: "./docker/docker-data/admin/msp/signcerts",
      tlsCert: fs.readFileSync("./docker/docker-data/tls-ca-cert.pem"),
      peerEndpoint: "localhost:7031",
      peerHostAlias: "localhost",
      chaincodeName: chaincodeName,
      ca: "org-a",
      mspId: "Peer0OrgaMSP",
      channel: "simple-channel",
    };

    clientAdapter = new FabricClientAdapter(peerConfig, adapterAlias);
    testERC20ModelRepository = new FabricERC20ClientRepository(clientAdapter);

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

    try {
      await testERC20ModelRepository.checkInitialized();
    } catch (e: any) {
      if (e.message.includes("NotInitializedError")) {
        await testERC20ModelRepository.initialize(testToken);
      } else {
        return new Error("Unexpected error occurred: " + e);
      }
    }

    adminID = await testERC20ModelRepository.clientAccountID();
    observer = new (class implements Observer {
      async refresh(table: string, event: string, id: any, payload: any) {
        // console.log("Received event: ", event, payload);
        return mock(event, payload);
      }
    })();
    testERC20ModelRepository.observe(observer);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.resetAllMocks();
    mock = jest.fn();
  });

  afterAll(async () => {
    testERC20ModelRepository.unObserve(observer);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  it("Fail do Re-Initialize ", async () => {
    let failedInitialize = false;
    try {
      await testERC20ModelRepository.initialize(testToken);
    } catch (e: any) {
      if (e.message.includes("AuthorizationError")) {
        console.log("Authorization Error occurred as expected");
        failedInitialize = true;
      } else {
        new Error("Unexpected error occurred: " + e);
      }
      expect(failedInitialize).toBe(true);
    }
  });

  it("Gets token name", async () => {
    const tokenName = await testERC20ModelRepository.tokenName();
    expect(tokenName).toBe(testToken.name);
  });

  it("Gets token symbol", async () => {
    const tokenSymbol = await testERC20ModelRepository.symbol();
    expect(tokenSymbol).toBe(testToken.symbol);
  });

  it("Gets token decimals", async () => {
    const tokenDecimals = await testERC20ModelRepository.decimals();
    expect(tokenDecimals).toBe(testToken.decimals);
  });

  it("Mints new tokens - Positive", async () => {
    await testERC20ModelRepository.mint(1000000);
  });

  it("Test events with mint", async () => {
    await testERC20ModelRepository.mint(1000000);

    await new Promise((resolve) => setTimeout(resolve, 4000));

    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock).toHaveBeenCalledWith(ERC20Events.TRANSFER, {
      from: "0x0",
      to: adminID,
      value: 1000000,
    });
  });

  it("Mints new token - Negative ( with unauthorized user )", async () => {
    const clientConfig = {
      keyCertOrDirectoryPath: Buffer.from(userID.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID.credentials!.certificate!),
    };

    const clienttestERC20ModelRepository = testERC20ModelRepository.for(
      clientConfig
    ) as FabricERC20ClientRepository;

    try {
      await clienttestERC20ModelRepository.mint(1000000); // This should fail
    } catch (e: any) {
      if (e.message.includes("AuthorizationError")) {
        console.log("Authorization Error occurred as expected");
      } else {
        throw new Error("Unexpected error occurred: " + e);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(mock).toHaveBeenCalledTimes(0);
  });

  it("Burn tokens - Positive", async () => {
    await testERC20ModelRepository.burn(500000);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock).toHaveBeenCalledWith(ERC20Events.TRANSFER, {
      from: adminID,
      to: "0x0",
      value: 500000,
    });
  });

  it("Burn tokens - Negative", async () => {
    const clientConfig = {
      keyCertOrDirectoryPath: Buffer.from(userID.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID.credentials!.certificate!),
    };

    const clienttestERC20ModelRepository = testERC20ModelRepository.for(
      clientConfig
    ) as FabricERC20ClientRepository;

    try {
      await clienttestERC20ModelRepository.burn(50000); // This should fail
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
    await testERC20ModelRepository.transfer(
      CryptoUtils.decode(clientID.id!),
      500
    );

    const balance = await testERC20ModelRepository.balanceOf(
      CryptoUtils.decode(clientID.id!)
    );
    expect(balance).toBe(500);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock).toHaveBeenCalledWith(ERC20Events.TRANSFER, {
      from: adminID,
      to: CryptoUtils.decode(clientID.id!),
      value: 500,
    });
  });

  it("Get client id", async () => {
    const clientConfig = {
      keyCertOrDirectoryPath: Buffer.from(userID.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID.credentials!.certificate!),
    };

    const clienttestERC20ModelRepository = testERC20ModelRepository.for(
      clientConfig
    ) as FabricERC20ClientRepository;

    const clientID = await clienttestERC20ModelRepository.clientAccountID();
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

    await testERC20ModelRepository.transfer(
      CryptoUtils.decode(userID.id!),
      500
    );

    const balance = await testERC20ModelRepository.balanceOf(
      CryptoUtils.decode(userID.id!)
    );
    expect(balance).toBe(500);

    const clientConfig = {
      keyCertOrDirectoryPath: Buffer.from(userID.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID.credentials!.certificate!),
    };

    const clienttestERC20ModelRepository = testERC20ModelRepository.for(
      clientConfig
    ) as FabricERC20ClientRepository;

    const clientBalance =
      await clienttestERC20ModelRepository.clientAccountBalance();
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

    await testERC20ModelRepository.transfer(
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

    const clienttestERC20ModelRepository1 = testERC20ModelRepository.for(
      clientConfig1
    ) as FabricERC20ClientRepository;

    await clienttestERC20ModelRepository1.transfer(
      CryptoUtils.decode(userID2.id!),
      500
    );

    const clienttestERC20ModelRepository2 = testERC20ModelRepository.for(
      clientConfig2
    ) as FabricERC20ClientRepository;

    const clientBalance =
      await clienttestERC20ModelRepository2.clientAccountBalance();
    expect(clientBalance).toBeDefined();
    expect(clientBalance).toEqual(500);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock).toHaveBeenLastCalledWith(ERC20Events.TRANSFER, {
      from: CryptoUtils.decode(userID1.id!),
      to: CryptoUtils.decode(userID2.id!),
      value: 500,
    });
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

    await testERC20ModelRepository.transfer(
      CryptoUtils.decode(userID1.id!),
      500
    );

    const clienttestERC20ModelRepository1 = testERC20ModelRepository.for(
      clientConfig1
    ) as FabricERC20ClientRepository;

    let failTransfer = false;

    try {
      await clienttestERC20ModelRepository1.transfer(
        CryptoUtils.decode(userID.id!),
        1000
      );
    } catch (e: any) {
      if (e.message.includes("BalanceError")) {
        console.log("Insufficient funds error occurred as expected");
        failTransfer = true;
      } else {
        throw new Error("Unexpected error occurred: " + e);
      }
    }

    expect(failTransfer).toBe(true);
  });

  it("Get total supply", async () => {
    const totalSupply = await testERC20ModelRepository.totalSupply();
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

    await testERC20ModelRepository.transfer(
      CryptoUtils.decode(userID1.id!),
      1000
    );

    const balance = await testERC20ModelRepository.balanceOf(
      CryptoUtils.decode(userID1.id!)
    );
    expect(balance).toBe(1000);

    await testERC20ModelRepository.burnFrom(
      CryptoUtils.decode(userID1.id!),
      500
    );

    const balanceAfterBurn = await testERC20ModelRepository.balanceOf(
      CryptoUtils.decode(userID1.id!)
    );
    expect(balanceAfterBurn).toBe(500);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock).toHaveBeenLastCalledWith(ERC20Events.TRANSFER, {
      from: CryptoUtils.decode(userID1.id!),
      to: "0x0",
      value: 500,
    });
  });

  it("Allowance workflow - Positive", async () => {
    const adminID = await testERC20ModelRepository.clientAccountID();
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

    await testERC20ModelRepository.transfer(
      CryptoUtils.decode(userID1.id!),
      1000
    );

    const clientConfig1 = {
      keyCertOrDirectoryPath: Buffer.from(userID1.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID1.credentials!.certificate!),
    };

    const clienttestERC20ModelRepository1 = testERC20ModelRepository.for(
      clientConfig1
    ) as FabricERC20ClientRepository;

    const approve = await clienttestERC20ModelRepository1.approve(adminID, 500);
    expect(approve).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock).toHaveBeenLastCalledWith(ERC20Events.APPROVAL, {
      owner: CryptoUtils.decode(userID1.id!),
      spender: adminID,
      value: 500,
    });

    const allowance = await testERC20ModelRepository.allowance(
      CryptoUtils.decode(userID1.id!),
      adminID
    );
    expect(allowance).toBe(500);

    const transferFrom = await testERC20ModelRepository.transferFrom(
      CryptoUtils.decode(userID1.id!),
      CryptoUtils.decode(userID2.id!),
      200
    );
    expect(transferFrom).toBe(true);

    const clientConfig2 = {
      keyCertOrDirectoryPath: Buffer.from(userID2.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID2.credentials!.certificate!),
    };

    const clienttestERC20ModelRepository2 = testERC20ModelRepository.for(
      clientConfig2
    ) as FabricERC20ClientRepository;

    const balanceAfterTransfer =
      await clienttestERC20ModelRepository2.clientAccountBalance();

    expect(balanceAfterTransfer).toBe(200);
  });

  it("Allowance workflow - Negative (owner doesn't have sufficient funds )", async () => {
    const adminID = await testERC20ModelRepository.clientAccountID();
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

    await testERC20ModelRepository.transfer(
      CryptoUtils.decode(userID1.id!),
      500
    );

    const clientConfig1 = {
      keyCertOrDirectoryPath: Buffer.from(userID1.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID1.credentials!.certificate!),
    };

    const clienttestERC20ModelRepository1 = testERC20ModelRepository.for(
      clientConfig1
    ) as FabricERC20ClientRepository;

    let failedApproved = false;
    try {
      await clienttestERC20ModelRepository1.approve(adminID, 10000);
    } catch (e: any) {
      if (e.message.includes("BalanceError")) {
        console.log("Insufficient funds error occurred as expected");
        failedApproved = true;
      } else {
        throw new Error("Unexpected error occurred: " + e);
      }
    }
    expect(failedApproved).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("Allowance workflow - Negative ( there is no allowance )", async () => {
    const adminID = await testERC20ModelRepository.clientAccountID();
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

    await testERC20ModelRepository.transfer(
      CryptoUtils.decode(userID1.id!),
      500
    );

    let failedTransferFrom = false;
    try {
      await testERC20ModelRepository.transferFrom(
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
        failedTransferFrom = true;
      } else {
        throw new Error("Unexpected error occurred: " + e);
      }
    }
    expect(failedTransferFrom).toBe(true);
  });

  it("Allowance workflow - Negative ( unsuficient allowance )", async () => {
    const adminID = await testERC20ModelRepository.clientAccountID();
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

    await testERC20ModelRepository.transfer(
      CryptoUtils.decode(userID1.id!),
      500
    );

    const clientConfig1 = {
      keyCertOrDirectoryPath: Buffer.from(userID1.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID1.credentials!.certificate!),
    };

    const clienttestERC20ModelRepository1 = testERC20ModelRepository.for(
      clientConfig1
    ) as FabricERC20ClientRepository;

    const approve = await clienttestERC20ModelRepository1.approve(adminID, 500);
    expect(approve).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock).toHaveBeenLastCalledWith(ERC20Events.APPROVAL, {
      owner: CryptoUtils.decode(userID1.id!),
      spender: adminID,
      value: 500,
    });

    let failedTransferFrom = false;
    try {
      await testERC20ModelRepository.transferFrom(
        CryptoUtils.decode(userID1.id!),
        adminID,
        1000
      );
    } catch (e: any) {
      if (e.message.includes("BalanceError")) {
        console.log("Insufficient funds error occurred as expected");
        failedTransferFrom = true;
      } else {
        throw new Error("Unexpected error occurred: " + e);
      }
    }
    expect(failedTransferFrom).toBe(true);
  });

  it("Allowance workflow - Negative ( user spends before spender makes the transaction )", async () => {
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

    await testERC20ModelRepository.transfer(
      CryptoUtils.decode(userID1.id!),
      500
    );

    const clientConfig1 = {
      keyCertOrDirectoryPath: Buffer.from(userID1.credentials!.privateKey!),
      certCertOrDirectoryPath: Buffer.from(userID1.credentials!.certificate!),
    };

    const clienttestERC20ModelRepository1 = testERC20ModelRepository.for(
      clientConfig1
    ) as FabricERC20ClientRepository;

    const approve = await clienttestERC20ModelRepository1.approve(adminID, 500);
    expect(approve).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock).toHaveBeenLastCalledWith(ERC20Events.APPROVAL, {
      owner: CryptoUtils.decode(userID1.id!),
      spender: adminID,
      value: 500,
    });

    const transfer = await clienttestERC20ModelRepository1.transfer(
      adminID,
      200
    );
    expect(transfer).toBe(true);

    let failedTransferFrom = false;

    try {
      await testERC20ModelRepository.transferFrom(
        CryptoUtils.decode(userID1.id!),
        adminID,
        500
      );
    } catch (e: any) {
      if (e.message.includes("BalanceError")) {
        console.log("Insufficient funds error occurred as expected");
        failedTransferFrom = true;
      } else {
        throw new Error("Unexpected error occurred: " + e);
      }
    }
    expect(failedTransferFrom).toBe(true);
  });
});
