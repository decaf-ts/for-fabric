import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const envFile = path.join(__dirname, "../environment/.env.pla");
dotenv.config({ path: envFile });
import { LoggedEnvironment, Logger, Logging } from "@decaf-ts/logging";
import {
  capitalize,
  convertToMS,
  generateMspId,
  STORAGE_DIR_NAME,
} from "../utils";
import {
  DeploymentOrchestrator,
  DeploymentStage,
  OrchestratorFactory,
} from "../../src/deployment";
import {
  BCCSPConfig,
  ConfigtxgenCommandBuilder,
  FabricAccountType,
  FabricCAClientCommand,
  FabricCAClientCommandBuilder,
  FabricCAServerConfigBuilder,
  FabricOrdererConfigBuilder,
  FabricOSNAdminCommandBuilder,
  FabricPeerChannelCommandBuilder,
  FabricPeerConfigBuilder,
  FabricPeerLifecycleChaincodeCommandBuilder,
  OSN_ADMIN_SUBCOMMANDS,
  PeerChannelCommands,
  PeerLifecycleChaincodeCommands,
  writeFileYaml,
} from "@decaf-ts/fabric-weaver";
import { execSync } from "child_process";
import { runAndReport, TestReporter } from "@decaf-ts/utils/tests";
import { StandardOutputWriter } from "@decaf-ts/utils";
import {
  copyAndOverrideYaml,
  DefaultInfrastructureConfig,
  InfrastructureConfig,
} from "../../src";

jest.setTimeout(convertToMS(60));

const InfrastructureEnvironment: InfrastructureConfig =
  LoggedEnvironment.accumulate(DefaultInfrastructureConfig);

const logger: Logger = Logging.for("Boot Infrastructure");

const orchestrator: DeploymentOrchestrator =
  OrchestratorFactory.getOrchestrator();

describe("Deploy Pharmaledger Second Channel", () => {
  let abort = false;
  let err: any;

  const shouldAbort = () => abort;
  const triggerAbort = () => {
    abort = true;
  };

  const dockerComposePath = path.join(
    __dirname,
    InfrastructureEnvironment.dockerComposePath
  );

  const baseEnv = {
    ORG_NAME: InfrastructureEnvironment.orgName,
    OPERATIONS_ADDRESS: InfrastructureEnvironment.ca.operationsAddress,
    LOG_LEVEL: InfrastructureEnvironment.logLevel,
  };

  beforeEach(() => {
    if (shouldAbort()) {
      throw new Error(
        `Aborting remaining tests because a previous test failed with error: ${err}`
      );
    }
  });

  afterEach(() => {
    const state = expect.getState();
    const assertionCalls = (state as any).assertionCalls ?? 0;
    const numPassingAsserts = (state as any).numPassingAsserts ?? 0;

    logger.info(
      `Step Status: ${assertionCalls > numPassingAsserts ? "Failed" : "Success"}`
    );

    if (assertionCalls > numPassingAsserts) triggerAbort();
  });

  beforeAll(async () => {
    // Create Base Storage folder
    const basePath = path.join(__dirname, STORAGE_DIR_NAME);
    fs.mkdirSync(basePath, {
      recursive: true,
    });

    // Create Organization folder
    const orgPath = path.join(basePath, InfrastructureEnvironment.orgName);
    fs.mkdirSync(orgPath, {
      recursive: true,
    });

    // Create base organizational folders
    const orgCaPath = path.join(
      basePath,
      InfrastructureEnvironment.orgName,
      DeploymentStage.CA,
      "server"
    );
    fs.mkdirSync(orgCaPath, {
      recursive: true,
    });

    const orgTlsPath = path.join(
      basePath,
      InfrastructureEnvironment.orgName,
      DeploymentStage.TLS
    );
    fs.mkdirSync(orgTlsPath, {
      recursive: true,
    });

    const reporter = new TestReporter();

    await (reporter as any).importHelpers();

    orchestrator.runFunction = (
      command: string,
      config: { [indexer: string]: any }
    ) => {
      return runAndReport(command, config, StandardOutputWriter, reporter)
        .promise;
    };
  });

  afterAll(() => {
    logger.info(
      "RUN COMMAND: sudo chown -R $USER:$USER ./tests/infrastructure/storage"
    );
  });

  describe("Deploy Second Channel", () => {
    it("STEP-1 Starts Tools service", async () => {
      try {
        // Resolve container name
        const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

        if (await orchestrator.isContainerRunning(containerName)) {
          logger.info(`${containerName} is running.`);
          return;
        }

        const tools = InfrastructureEnvironment.tools;

        logger.info(`Start container ${containerName}.`);

        const env = Object.assign({}, process.env, baseEnv, {
          IMAGE: tools.image,
        });

        await orchestrator.serviceStart(
          InfrastructureEnvironment.orgName,
          DeploymentStage.TOOLS,
          dockerComposePath,
          { env }
        );

        await orchestrator.awaitContainerReadiness(containerName);
      } catch (e: unknown) {
        err = e;
        logger.error(`Failed to start Tools.`, e as Error);
        expect(e).toBeUndefined();
        return;
      }
    });

    describe("Channel", () => {
      let peerJoinedChannel = false;

      it("STEP-2 Creates Channel Configuration (configtx.yaml)", async () => {
        try {
          const peerContainerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`;
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

          if (!(await orchestrator.isContainerRunning(peerContainerName))) {
            logger.info(
              `Peer-0 container ${peerContainerName} is not running. Skipping channel configuration (configtx.yaml).`
            );
            return;
          }

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(
              `Tools container ${containerName} is not running. Skipping channel configuration (configtx.yaml).`
            );
            return;
          }

          const channel = InfrastructureEnvironment.onPremChannel;

          const command = `peer channel list`;

          logger.info(
            `Checking existing channels on ${peerContainerName} (command: ${command}).`
          );

          const channelList = await orchestrator.exec(
            peerContainerName,
            command,
            []
          );

          peerJoinedChannel = channelList
            .toString()
            .split("\n")
            .some((line: string) => line.includes(channel.name));

          logger.debug(
            `Existing channels on ${InfrastructureEnvironment.orgName}:\n${channelList.toString()}`
          );

          if (peerJoinedChannel) {
            logger.info(
              `Peer already joined channel "${channel.name}". Skipping configtx.yaml generation and copy.`
            );
            return;
          }

          logger.info(
            `Generating configtx.yaml for channel "${channel.name}" (profile: "${channel.profile}") and organization ${InfrastructureEnvironment.orgName}.`
          );

          const configOriginPath = path.join(
            __dirname,
            "../../docker/configtx.yaml"
          );

          const configDestFolder = path.join(
            __dirname,
            STORAGE_DIR_NAME,
            InfrastructureEnvironment.orgName,
            DeploymentStage.TOOLS
          );

          const configDestPath = path.join(configDestFolder, "configtx.yaml");

          fs.mkdirSync(configDestFolder, { recursive: true });

          const overrides = {
            ORG_NAME: capitalize(
              InfrastructureEnvironment.orgName.toLowerCase()
            ),
            ORG_MSPID:
              capitalize(InfrastructureEnvironment.orgName.toLowerCase()) +
              "MSP",
            ORG_MSPDIR: "/weaver/org-msp",
            PEER0_HOST: `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`,
            PEER0_PORT: InfrastructureEnvironment.peer0.port.toString(),
            PEER1_HOST: `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-1`,
            PEER1_PORT: InfrastructureEnvironment.peer1.port.toString(),
            PEER2_HOST: `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-2`,
            PEER2_PORT: InfrastructureEnvironment.peer2.port.toString(),
            ORDERER0_HOST: `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-0`,
            ORDERER0_PORT: InfrastructureEnvironment.orderer0.port.toString(),
            ORDERER1_HOST: `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-1`,
            ORDERER1_PORT: InfrastructureEnvironment.orderer1.port.toString(),
            ORDERER2_HOST: `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-2`,
            ORDERER2_PORT: InfrastructureEnvironment.orderer2.port.toString(),
            CHANNEL_PROFILE: InfrastructureEnvironment.channel.profile,
            ON_PREM_CHANNEL_PROFILE: channel.profile,
          };

          logger.info(
            `Writing configtx.yaml with organization-specific overrides to ${configDestPath}.`
          );

          copyAndOverrideYaml(configOriginPath, configDestPath, overrides);

          logger.info(
            `Copying configtx.yaml into tools container ${containerName}.`
          );

          await orchestrator.copyToAndFromContainer(
            containerName,
            configDestPath,
            "/weaver/tools/configtx.yaml"
          );

          logger.info(
            `configtx.yaml successfully copied to tools container ${containerName} at /weaver/tools/configtx.yaml.`
          );
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to generate or copy configtx.yaml.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });

      it("STEP-3 Creates Genesis Block", async () => {
        try {
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(
              `Tools container ${containerName} is not running. Skipping genesis block generation.`
            );
            return;
          }

          if (peerJoinedChannel) {
            logger.info(
              `Channel "${InfrastructureEnvironment.onPremChannel.name}" already exists. Skipping genesis block generation.`
            );
            return;
          }

          const channel = InfrastructureEnvironment.onPremChannel;

          logger.info(
            `Generating genesis block for channel "${channel.name}" using profile "${channel.profile}" (container: ${containerName}).`
          );

          const builder = new ConfigtxgenCommandBuilder();

          const cmd = builder
            .setConfigPath(`/weaver/tools`)
            .setProfile(channel.profile)
            .setChannelID(channel.name)
            .setOutputBlock(`/weaver/tools/on_prem_genesis_block.pb`)
            .build();

          logger.debug(`Executing configtxgen in ${containerName}: ${cmd}`);

          await orchestrator.executeInContainer(containerName, cmd.split(" "));

          logger.info(
            `Genesis block generated successfully at /weaver/tools/on_prem_genesis_block.pb (container: ${containerName}).`
          );
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to generate genesis block.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });

      it("STEP-4 Copy Genesis BLock to Orderers", async () => {
        try {
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(
              `Tools container ${containerName} is not running. Skipping genesis block copy to orderers.`
            );
            return;
          }

          const channel = InfrastructureEnvironment.onPremChannel;

          if (peerJoinedChannel) {
            logger.info(
              `Channel "${channel.name}" already exists. Skipping genesis block copy to orderers.`
            );
            return;
          }

          if (peerJoinedChannel) {
            logger.info(
              `Channel already exists. Skipping channel configuration and creation steps.`
            );
            return;
          }

          logger.info(
            `Copying genesis block to orderer volumes (container: ${containerName}).`
          );

          const genesisBlockPath = `/weaver/tools/on_prem_genesis_block.pb`;

          let command = `cp ${genesisBlockPath} /weaver/orderers/orderer-0`;
          logger.debug(`Executing copy to orderer-0: ${command}`);
          await orchestrator.executeInContainer(
            containerName,
            command.split(" ")
          );

          logger.info(`Genesis block copied to orderer-0 volume.`);

          command = `cp ${genesisBlockPath} /weaver/orderers/orderer-1`;
          logger.debug(`Executing copy to orderer-1: ${command}`);
          await orchestrator.executeInContainer(
            containerName,
            command.split(" ")
          );

          logger.info(`Genesis block copied to orderer-1 volume.`);

          command = `cp ${genesisBlockPath} /weaver/orderers/orderer-2`;
          logger.debug(`Executing copy to orderer-2: ${command}`);
          await orchestrator.executeInContainer(
            containerName,
            command.split(" ")
          );

          logger.info(`Genesis block copied to orderer-2 volume.`);

          logger.info(
            `Genesis block copy to all orderer volumes completed successfully.`
          );
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to copy genesis block to orderers.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });

      it("STEP-5 Joins Orderers to the channel", async () => {
        try {
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(
              `Tools container ${containerName} is not running. Skipping orderer channel join.`
            );
            return;
          }

          const channel = InfrastructureEnvironment.onPremChannel;

          if (peerJoinedChannel) {
            logger.info(
              `Peer is already joined to channel "${channel.name}". Skipping orderer channel join.`
            );
            return;
          }

          logger.info(
            `Joining orderers to channel "${channel.name}" (container: ${containerName}).`
          );

          const orderer0 = InfrastructureEnvironment.orderer0;
          const orderer1 = InfrastructureEnvironment.orderer1;
          const orderer2 = InfrastructureEnvironment.orderer2;

          let builder = new FabricOSNAdminCommandBuilder();
          let command = builder
            .setCommand(OSN_ADMIN_SUBCOMMANDS.JOIN)
            .setChannelID(channel.name)
            .setOrdererAddress(
              `${InfrastructureEnvironment.orgName}-orderer-0:${orderer0.osnPort}`
            )
            .setConfigBlock(
              `/weaver/orderers/orderer-0/on_prem_genesis_block.pb`
            )
            .setCAFile("/weaver/shared/tls-cert.pem")
            .setClientCert(
              `/weaver/orderers/orderer-0/tls/msp/signcerts/cert.pem`
            )
            .setClientKey(`/weaver/orderers/orderer-0/tls/msp/keystore/key.pem`)
            .build();

          logger.info(`Executing osnadmin join (orderer-0): ${command}`);

          await orchestrator.executeInContainer(
            containerName,
            command.split(" ")
          );

          logger.info(`Orderer-0 joined channel "${channel.name}".`);

          logger.info(`Joining orderer-1 to channel "${channel.name}".`);
          builder = new FabricOSNAdminCommandBuilder();
          command = builder
            .setCommand(OSN_ADMIN_SUBCOMMANDS.JOIN)
            .setChannelID(channel.name)
            .setOrdererAddress(
              `${InfrastructureEnvironment.orgName}-orderer-1:${orderer1.osnPort}`
            )
            .setConfigBlock(
              `/weaver/orderers/orderer-1/on_prem_genesis_block.pb`
            )
            .setCAFile("/weaver/shared/tls-cert.pem")
            .setClientCert(
              `/weaver/orderers/orderer-1/tls/msp/signcerts/cert.pem`
            )
            .setClientKey(`/weaver/orderers/orderer-1/tls/msp/keystore/key.pem`)
            .build();

          logger.info(`Executing osnadmin join (orderer-1): ${command}`);

          await orchestrator.executeInContainer(
            containerName,
            command.split(" ")
          );

          logger.info(`Orderer-1 joined channel "${channel.name}".`);
          logger.info(`Joining orderer-2 to channel "${channel.name}".`);

          builder = new FabricOSNAdminCommandBuilder();
          command = builder
            .setCommand(OSN_ADMIN_SUBCOMMANDS.JOIN)
            .setChannelID(channel.name)
            .setOrdererAddress(
              `${InfrastructureEnvironment.orgName}-orderer-2:${orderer2.osnPort}`
            )
            .setConfigBlock(
              `/weaver/orderers/orderer-2/on_prem_genesis_block.pb`
            )
            .setCAFile("/weaver/shared/tls-cert.pem")
            .setClientCert(
              `/weaver/orderers/orderer-2/tls/msp/signcerts/cert.pem`
            )
            .setClientKey(`/weaver/orderers/orderer-2/tls/msp/keystore/key.pem`)
            .build();

          logger.info(`Executing osnadmin join (orderer-2): ${command}`);

          await orchestrator.executeInContainer(
            containerName,
            command.split(" ")
          );
          logger.info(`Orderer-2 joined channel "${channel.name}".`);

          logger.info(
            `All orderers joined channel "${channel.name}" successfully.`
          );
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to copy genesis block to orderers.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });

      it("STEP-6 Joins peers to the channel", async () => {
        try {
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(
              `Tools container ${containerName} is not running. Skipping peer channel join.`
            );
            return;
          }

          const channel = InfrastructureEnvironment.onPremChannel;

          if (peerJoinedChannel) {
            logger.info(
              `Peers are already joined to channel "${channel.name}". Skipping peer channel join.`
            );
            return;
          }

          const orderer = InfrastructureEnvironment.orderer0;
          const tls = InfrastructureEnvironment.tls;

          function sleep(s: number) {
            const ms = s * 1000;
            return new Promise((resolve) => setTimeout(resolve, ms));
          }

          async function repeatRequest(
            container: string,
            command: string,
            counter: number = 1,
            maxAttempts: number = 5
          ) {
            if (counter >= maxAttempts) {
              throw new Error(`Exceeded retry attempts (${maxAttempts})`);
            }

            logger.info(
              `Attempt ${counter}/${maxAttempts}: executing peer channel command in ${container}.`
            );

            try {
              await orchestrator.executeInContainer(
                container,
                command.split(" ")
              );
            } catch (e: unknown) {
              logger.info(`Retry cause: ${(e as Error)?.message ?? e}`);
              await sleep(5);
              counter = counter + 1;
              return await repeatRequest(container, command, counter);
            }
          }

          let peerContainerName = `${InfrastructureEnvironment.orgName}-peer-0`;
          logger.info(
            `Fetching genesis block for peer-0 (${peerContainerName}).`
          );

          let builder = new FabricPeerChannelCommandBuilder();

          let command = builder
            .enableTLS(true)
            .setCommand(PeerChannelCommands.FETCH)
            .setBlockReference("0")
            .setDestination("/etc/hyperledger/fabric/on_prem_genesis_block.pb")
            .setOrderer(
              `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-0:${orderer.port}`
            )
            .setChannelID(channel.name)
            .setTLSCAFile(
              `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${InfrastructureEnvironment.orgName}-tls-${tls.port}.pem`
            )
            .build(); //+ ` --ordererTLSHostnameOverride ${orgName}-${ord.name}`;

          await repeatRequest(peerContainerName, command);

          logger.info(
            `Joining peer-0 (${peerContainerName}) to channel "${channel.name}".`
          );

          builder = new FabricPeerChannelCommandBuilder();

          command = builder
            .setCommand(PeerChannelCommands.JOIN)
            .setBlockPath("/etc/hyperledger/fabric/on_prem_genesis_block.pb")
            .setTLSCAFile(
              `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${InfrastructureEnvironment.orgName}-tls-${tls.port}.pem`
            )
            .build();

          logger.info(`Executing JOIN on ${peerContainerName}: ${command}`);

          await orchestrator.exec(peerContainerName, command, [
            `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
          ]);

          logger.info(`Peer-0 joined channel "${channel.name}".`);

          peerContainerName = `${InfrastructureEnvironment.orgName}-peer-1`;
          logger.info(
            `Fetching genesis block for peer-1 (${peerContainerName}).`
          );

          builder = new FabricPeerChannelCommandBuilder();

          command = builder
            .enableTLS(true)
            .setCommand(PeerChannelCommands.FETCH)
            .setBlockReference("0")
            .setDestination("/etc/hyperledger/fabric/on_prem_genesis_block.pb")
            .setOrderer(
              `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-0:${orderer.port}`
            )
            .setChannelID(channel.name)
            .setTLSCAFile(
              `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${InfrastructureEnvironment.orgName}-tls-${tls.port}.pem`
            )
            .build(); //+ ` --ordererTLSHostnameOverride ${orgName}-${ord.name}`;

          await repeatRequest(peerContainerName, command);

          logger.info(
            `Joining peer-1 (${peerContainerName}) to channel "${channel.name}".`
          );

          builder = new FabricPeerChannelCommandBuilder();

          command = builder
            .setCommand(PeerChannelCommands.JOIN)
            .setBlockPath("/etc/hyperledger/fabric/on_prem_genesis_block.pb")
            .setTLSCAFile(
              `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${InfrastructureEnvironment.orgName}-tls-${tls.port}.pem`
            )
            .build();

          logger.info(`Executing JOIN on ${peerContainerName}: ${command}`);

          await orchestrator.exec(peerContainerName, command, [
            `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
          ]);

          logger.info(`Peer-1 joined channel "${channel.name}".`);

          peerContainerName = `${InfrastructureEnvironment.orgName}-peer-2`;
          logger.info(
            `Fetching genesis block for peer-2 (${peerContainerName}).`
          );

          builder = new FabricPeerChannelCommandBuilder();

          command = builder
            .enableTLS(true)
            .setCommand(PeerChannelCommands.FETCH)
            .setBlockReference("0")
            .setDestination("/etc/hyperledger/fabric/on_prem_genesis_block.pb")
            .setOrderer(
              `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-0:${orderer.port}`
            )
            .setChannelID(channel.name)
            .setTLSCAFile(
              `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${InfrastructureEnvironment.orgName}-tls-${tls.port}.pem`
            )
            .build(); //+ ` --ordererTLSHostnameOverride ${orgName}-${ord.name}`;

          await repeatRequest(peerContainerName, command);
          logger.info(
            `Joining peer-2 (${peerContainerName}) to channel "${channel.name}".`
          );

          builder = new FabricPeerChannelCommandBuilder();

          command = builder
            .setCommand(PeerChannelCommands.JOIN)
            .setBlockPath("/etc/hyperledger/fabric/on_prem_genesis_block.pb")
            .setTLSCAFile(
              `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${InfrastructureEnvironment.orgName}-tls-${tls.port}.pem`
            )
            .build();

          logger.info(`Executing JOIN on ${peerContainerName}: ${command}`);

          await orchestrator.exec(peerContainerName, command, [
            `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
          ]);

          logger.info(`Peer-2 joined channel "${channel.name}".`);

          logger.info(
            `All peers joined channel "${channel.name}" successfully.`
          );
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to copy genesis block to orderers.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
    });

    describe("Idle container stop", () => {
      it("STEP-7 Stops tools service", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is stopped.`);
            return;
          }

          const tools = InfrastructureEnvironment.tools;

          logger.info(`Shutdown container ${containerName}.`);

          const env = Object.assign({}, process.env, baseEnv, {
            IMAGE: tools.image,
          });

          await orchestrator.serviceStop(
            InfrastructureEnvironment.orgName,
            DeploymentStage.TOOLS,
            dockerComposePath,
            { env }
          );
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to shutdown Tools.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
    });
  });

  describe("Build Second Contract", () => {
    describe("SIMPLE-XXX - Build Contract", () => {
      it("STEP-1 Starts Tools service", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

          if (await orchestrator.isContainerRunning(containerName)) {
            logger.info(`${containerName} is running.`);
            return;
          }

          const tools = InfrastructureEnvironment.tools;

          logger.info(`Start container ${containerName}.`);

          const env = Object.assign({}, process.env, baseEnv, {
            IMAGE: tools.image,
          });

          await orchestrator.serviceStart(
            InfrastructureEnvironment.orgName,
            DeploymentStage.TOOLS,
            dockerComposePath,
            { env }
          );

          await orchestrator.awaitContainerReadiness(containerName);
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to start Tools.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });

      it("STEP-2 Builds contract and populates contract volume", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is not running.`);
            return;
          }

          const contractsLocalFolder = path.join(
            __dirname,
            STORAGE_DIR_NAME,
            InfrastructureEnvironment.orgName,
            "contracts"
          );

          const toolkitMetaInfFolder = path.join(
            contractsLocalFolder,
            "META-INF"
          );

          fs.mkdirSync(contractsLocalFolder, { recursive: true });

          // The contract is provided as a docker image (CONTRACT__IMAGE).
          // Extract the pre-built contract bundle from the image.
          const contractImage = InfrastructureEnvironment.onPremContract.image;
          const contractContainer = `${InfrastructureEnvironment.orgName}-on-prem-contract-build`;

          logger.info(
            `Extracting contract bundle from image ${contractImage} into ${contractsLocalFolder}.`
          );

          execSync(`docker rm -f ${contractContainer} 2>/dev/null || true`, {
            stdio: "inherit",
          });

          execSync(
            `docker create --name ${contractContainer} ${contractImage}`,
            {
              stdio: "inherit",
            }
          );

          execSync(
            `docker cp ${contractContainer}:/contract/. ${contractsLocalFolder}`,
            {
              stdio: "inherit",
            }
          );

          execSync(`docker rm ${contractContainer}`, {
            stdio: "inherit",
          });

          if (!fs.existsSync(toolkitMetaInfFolder)) {
            throw new Error(
              `Contract bundle does not contain a META-INF folder (${toolkitMetaInfFolder}). Check the contract image ${contractImage}.`
            );
          }

          const containerPath = `/weaver/contract/${InfrastructureEnvironment.onPremContract.name}`;

          let command = `rm -rf ${containerPath}`;

          await orchestrator.executeInContainer(
            containerName,
            command.split(" ")
          );

          command = `mkdir -p ${containerPath}`;

          await orchestrator.executeInContainer(
            containerName,
            command.split(" ")
          );

          await orchestrator.copyToAndFromContainer(
            containerName,
            toolkitMetaInfFolder,
            `/weaver/contract/${InfrastructureEnvironment.onPremContract.name}/META-INF`
          );
        } catch (e: unknown) {
          err = e;
          logger.error("Error Building Contracts", e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });

      it("STEP-3 Stop Tools service", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is running.`);
            return;
          }

          const tools = InfrastructureEnvironment.tools;

          logger.info(`Shutdown container ${containerName}.`);

          const env = Object.assign({}, process.env, baseEnv, {
            IMAGE: tools.image,
          });

          await orchestrator.serviceStop(
            InfrastructureEnvironment.orgName,
            DeploymentStage.TOOLS,
            dockerComposePath,
            { env }
          );
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to shutdown Tools.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
    });
  });

  describe("Deploy Second Contract", () => {
    describe("SIMPLE-XXX - Deploy Contract", () => {
      let peerInstalledContract = false;
      const sequence = 1;

      it("STEP-1 Starts Tools service", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

          if (await orchestrator.isContainerRunning(containerName)) {
            logger.info(`${containerName} is running.`);
            return;
          }

          const tools = InfrastructureEnvironment.tools;

          logger.info(`Start container ${containerName}.`);

          const env = Object.assign({}, process.env, baseEnv, {
            IMAGE: tools.image,
          });

          await orchestrator.serviceStart(
            InfrastructureEnvironment.orgName,
            DeploymentStage.TOOLS,
            dockerComposePath,
            { env }
          );

          await orchestrator.awaitContainerReadiness(containerName);
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to start Tools.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });

      it("STEP-2 Creates Installation Package", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;
          const peerContainer = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is not running running.`);
            return;
          }

          const builder = new FabricPeerLifecycleChaincodeCommandBuilder();

          const command = builder
            .setCommand(PeerLifecycleChaincodeCommands.QUERYINSTALLED)
            .build();

          const contractList = await orchestrator.exec(peerContainer, command, [
            `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
          ]);

          peerInstalledContract = contractList
            .toString()
            .split("\n")
            .some((line: string) =>
              line.includes(InfrastructureEnvironment.onPremContract.name)
            );

          if (peerInstalledContract) {
            logger.info("Exiting");
            return;
          }

          const chaincode = InfrastructureEnvironment.onPremContract;

          const basePath = path.join(
            __dirname,
            STORAGE_DIR_NAME,
            InfrastructureEnvironment.orgName,
            `contracts/${InfrastructureEnvironment.onPremContract.name}`
          );

          const certPath = path.join(basePath, "tls-cert.pem");

          fs.mkdirSync(basePath, {
            recursive: true,
          });

          await orchestrator.copyToAndFromContainer(
            containerName,
            "/weaver/shared/tls-cert.pem",
            certPath,
            "from"
          );

          await orchestrator.copyToAndFromContainer(
            containerName,
            `/weaver/contract/${InfrastructureEnvironment.onPremContract.name}/META-INF`,
            basePath,
            "from"
          );

          const connection = {
            address: `${InfrastructureEnvironment.orgName}-ccaas-${chaincode.name}:${chaincode.port}`,
            dial_timeout: "10s",
            tls_required: true,
            client_auth_required: false,
            root_cert: fs.readFileSync(path.join(certPath)).toString(),
          };

          fs.writeFileSync(
            path.join(basePath, "connection.json"),
            JSON.stringify(connection, null, 2)
          );

          execSync(
            `cd ${basePath} && tar -czf code.tar.gz connection.json META-INF 2>/dev/null || tar -czf code.tar.gz connection.json`
          );

          const metadata = {
            path: "",
            type: "ccaas",
            label: `${chaincode.name}_ccaas`,
          };

          fs.writeFileSync(
            path.join(basePath, "metadata.json"),
            JSON.stringify(metadata, null, 2)
          );

          execSync(
            `cd ${basePath} && tar -czf ${chaincode.name}_ccaas.tar.gz metadata.json code.tar.gz 2>/dev/null`
          );

          fs.rmSync(path.join(basePath, "code.tar.gz"));
          fs.rmSync(path.join(basePath, "metadata.json"));
          fs.rmSync(path.join(basePath, "connection.json"));

          await orchestrator.copyToAndFromContainer(
            containerName,
            path.join(basePath, `${chaincode.name}_ccaas.tar.gz`),
            `/weaver/contract/${InfrastructureEnvironment.onPremContract.name}/${chaincode.name}_ccaas.tar.gz`
          );
        } catch (e: unknown) {
          err = e;
          logger.error(
            "Failed to create contract instalation package",
            e as Error
          );
          expect(e).toBeUndefined();
          return;
        }
      });

      it("STEP-3 Installs contract on peers", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is not running running.`);
            return;
          }

          if (peerInstalledContract) {
            logger.info("Exiting");
            return;
          }

          const chaincode = InfrastructureEnvironment.onPremContract;

          let peerContainer = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`;
          let builder = new FabricPeerLifecycleChaincodeCommandBuilder();

          let command = builder
            .setCommand(PeerLifecycleChaincodeCommands.INSTALL)
            .setDestination(
              `/etc/hyperledger/contract/${chaincode.name}/${chaincode.name}_ccaas.tar.gz`
            )
            .build();

          logger.info(`Running command: ${command}`);

          await orchestrator.exec(peerContainer, command, [
            `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
          ]);

          peerContainer = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-1`;
          builder = new FabricPeerLifecycleChaincodeCommandBuilder();
          command = builder
            .setCommand(PeerLifecycleChaincodeCommands.INSTALL)
            .setDestination(
              `/etc/hyperledger/contract/${chaincode.name}/${chaincode.name}_ccaas.tar.gz`
            )
            .build();

          logger.info(`Running command: ${command}`);

          await orchestrator.exec(peerContainer, command, [
            `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
          ]);

          peerContainer = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-2`;
          builder = new FabricPeerLifecycleChaincodeCommandBuilder();
          command = builder
            .setCommand(PeerLifecycleChaincodeCommands.INSTALL)
            .setDestination(
              `/etc/hyperledger/contract/${chaincode.name}/${chaincode.name}_ccaas.tar.gz`
            )
            .build();

          logger.info(`Running command: ${command}`);

          await orchestrator.exec(peerContainer, command, [
            `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
          ]);
        } catch (e: unknown) {
          err = e;
          logger.error("Failed to install contract package", e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });

      it("STEP-4 Start Contract CaaS Service", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CCAAS}-${InfrastructureEnvironment.onPremContract.name}`;

          if (await orchestrator.isContainerRunning(containerName)) {
            logger.info(`${containerName} is already running running.`);
            return;
          }

          const chaincode = InfrastructureEnvironment.onPremContract;

          const container = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`;

          const builder = new FabricPeerLifecycleChaincodeCommandBuilder();
          const command = builder
            .setCommand(PeerLifecycleChaincodeCommands.QUERYINSTALLED)
            .build();
          logger.info(`Running command: ${command}`);

          let id = await orchestrator.exec(container, command, [
            `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
          ]);

          if (id.stdout) {
            id = id.stdout;
          }

          const packageID = id
            .toString()
            .split(",")[0]
            .split("\n")[1]
            .split(":")
            .slice(1)
            .map((s: string) => s.trim())
            .join(":");

          // Prepare environment
          const env = Object.assign({}, process.env, baseEnv, {
            PACKAGE_ID: packageID,
            CONTRACT_NAME: chaincode.name,
            PORT: chaincode.port,
            IMAGE: chaincode.image,
            CHAINCODE_MAXRECVMSGSIZE: chaincode.maxRecvMsgSize,
            CHAINCODE_MAXSENDMSGSIZE: chaincode.maxSendMsgSize,
            // CORE_PEER_LOCALMSPID: generateMspId(
            //   InfrastructureEnvironment.orgName.toLowerCase()
            // ),
          });

          await orchestrator.serviceUp(
            InfrastructureEnvironment.orgName,
            `${DeploymentStage.CCAAS}-${DeploymentStage.ON_PREM}`,
            dockerComposePath,
            { env }
          );
        } catch (e: unknown) {
          err = e;
          logger.error("Failed to boot contract container", e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });

      it("STEP-5 Approves Contract", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is not running running.`);
            return;
          }

          //TODO: Find some exit condition

          let builder = new FabricPeerLifecycleChaincodeCommandBuilder();

          let command = builder
            .setCommand(PeerLifecycleChaincodeCommands.QUERYINSTALLED)
            .build();

          logger.info(`Running command: ${command}`);

          let id = await orchestrator.exec(containerName, command, [
            `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
          ]);

          if (id.stdout) {
            id = id.stdout;
          }

          builder = new FabricPeerLifecycleChaincodeCommandBuilder();

          command = builder
            .setCommand(PeerLifecycleChaincodeCommands.APPROVEFORMYORG)
            .setChannelID(InfrastructureEnvironment.onPremChannel.name)
            .setOrdererAddress(
              `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-0:${InfrastructureEnvironment.orderer0.port}`
            )
            .setPackageID(
              id
                .toString()
                .split(",")[0]
                .split("\n")[1]
                .split(":")
                .slice(1)
                .map((s: string) => s.trim())
                .join(":")
            )
            .setVersion(InfrastructureEnvironment.onPremContract.version)
            .setSequence(sequence.toString())
            .enableTLS(true)
            .setTLSCAFile(`/etc/hyperledger/shared/tls-cert.pem`)
            .setContractName(InfrastructureEnvironment.onPremContract.name)
            // .setCollectionsConfigPath(
            //   `/etc/hyperledger/contract/${InfrastructureEnvironment.contract.name}/META-INF/collections_config.json`
            // )
            .build();

          logger.info(`Running command: ${command}`);

          await orchestrator.exec(containerName, command, [
            `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
          ]);
        } catch (e: unknown) {
          err = e;
          logger.error("Failed to install contract package", e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });

      it("STEP-6 Commits Contract", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is not running running.`);
            return;
          }

          //TODO: Find exit condition

          async function chaincodeReadiness(container: string) {
            const builder = new FabricPeerLifecycleChaincodeCommandBuilder();

            const cmd = builder
              .setCommand(PeerLifecycleChaincodeCommands.CHECKCOMMITREADINESS)
              .setChannelID(InfrastructureEnvironment.onPremChannel.name)
              .setContractName(InfrastructureEnvironment.onPremContract.name)
              .setVersion(InfrastructureEnvironment.contract.version)
              .setSequence(sequence.toString())
              .enableTLS(true)
              .setTLSCAFile(`/etc/hyperledger/shared/tls-cert.pem`)
              .setOutput("json")
              .build();

            const res = await orchestrator.executeInContainer(
              container,
              cmd.split(" ")
            );

            const approvalJSON = JSON.parse(
              res.stdout.toString().replace(/[^\x20-\x7E]+/g, "")
            );

            const hasApproval =
              Object.keys(approvalJSON.approvals).filter(
                (key) => approvalJSON.approvals[key] == true
              ).length >
              Object.keys(approvalJSON.approvals).length / 2;

            if (hasApproval) return;

            await new Promise((resolve) => setTimeout(resolve, 30000));

            await chaincodeReadiness(containerName);
          }

          await chaincodeReadiness(containerName);

          const peer = InfrastructureEnvironment.peer0;
          const orderer = InfrastructureEnvironment.orderer0;
          const builder = new FabricPeerLifecycleChaincodeCommandBuilder();

          const cmd = builder
            .setCommand(PeerLifecycleChaincodeCommands.COMMIT)
            .setChannelID(InfrastructureEnvironment.onPremChannel.name)
            .setContractName(InfrastructureEnvironment.onPremContract.name)
            .setVersion(InfrastructureEnvironment.onPremContract.version)
            .setSequence(sequence.toString())
            .enableTLS(true)
            .setTLSCAFile(`/etc/hyperledger/shared/tls-cert.pem`)
            .setPeerAddresses([
              `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0:${peer.port}`,
            ])
            .setPeerTLSRoots(["/etc/hyperledger/shared/tls-cert.pem"])
            .setOrdererAddress(
              `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-0:${orderer.port}`
            )
            // .setCollectionsConfigPath(
            //   `/etc/hyperledger/contract/${InfrastructureEnvironment.contract.name}/META-INF/collections_config.json`
            // )
            .build();

          logger.info(`Running command: ${cmd}`);
          await orchestrator.executeInContainer(containerName, cmd.split(" "));
        } catch (e: unknown) {
          err = e;
          logger.error("Failed to install contract package", e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });

      it("STEP-7 Stop Tools service", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is running.`);
            return;
          }

          const tools = InfrastructureEnvironment.tools;

          logger.info(`Shutdown container ${containerName}.`);

          const env = Object.assign({}, process.env, baseEnv, {
            IMAGE: tools.image,
          });

          await orchestrator.serviceStop(
            InfrastructureEnvironment.orgName,
            DeploymentStage.TOOLS,
            dockerComposePath,
            { env }
          );
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to shutdown Tools.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
    });
  });
});
