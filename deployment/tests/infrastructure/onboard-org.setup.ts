import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";
import path from "path";
import fs from "fs";

// The organization being onboarded is selected via the ONBOARD_ENV_FILE
// environment variable, pointing at the env file for that organization
// (e.g. .env.onboard.orgc, .env.onboard.orgb).
const onboardEnvFileName =
  process.env.ONBOARD_ENV_FILE || ".env.onboard.orgc";
const envOnboard = path.join(__dirname, `../environment/${onboardEnvFileName}`);

const envPrivateFile = path.join(__dirname, "../environment/.env.secret");
const env1 = dotenv.config({
  path: [envOnboard, envPrivateFile],
});
dotenvExpand.expand(env1);

import {
  capitalize,
  convertToMS,
  generateMspId,
  STORAGE_DIR_NAME,
} from "../utils";
import {
  copyAndOverrideYaml,
  DefaultOnboardPartnerConfig,
  OnboardConfig,
} from "../../src";
import { LoggedEnvironment, Logger, Logging } from "@decaf-ts/logging";
import {
  DeploymentOrchestrator,
  OrchestratorFactory,
  DeploymentStage,
} from "../../src/deployment";
import {
  BCCSPConfig,
  ConfigtxlatorCommand,
  ConfigtxlatorCommandBuilder,
  ConfigtxlatorProtoMessage,
  FabricAccountType,
  FabricCAClientCommand,
  FabricCAClientCommandBuilder,
  FabricCAServerConfigBuilder,
  FabricPeerChannelCommandBuilder,
  FabricPeerConfigBuilder,
  FabricPeerLifecycleChaincodeCommandBuilder,
  PeerChannelCommands,
  PeerLifecycleChaincodeCommands,
  writeFileYaml,
} from "@decaf-ts/fabric-weaver";
import { execSync } from "child_process";

jest.setTimeout(convertToMS(60));

const env: OnboardConfig = LoggedEnvironment.accumulate(
  DefaultOnboardPartnerConfig
);

const logger: Logger = Logging.for("Onboard Partner");

const orchestrator: DeploymentOrchestrator =
  OrchestratorFactory.getOrchestrator();

describe("Onboard Partner", () => {
  let abort = false;
  let err: any;
  const shouldAbort = () => abort;
  const triggerAbort = () => {
    abort = true;
  };
  const dockerComposePath = path.join(__dirname, env.dockerComposePath);
  const baseEnv = {
    ORG_NAME: env.orgName,
    OPERATIONS_ADDRESS: env.ca.operationsAddress,
    LOG_LEVEL: env.logLevel,
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
  beforeAll(() => {
    // Create Base Storage folder
    const basePath = path.join(__dirname, STORAGE_DIR_NAME);
    fs.mkdirSync(basePath, {
      recursive: true,
    });
    // Create Organization folder
    const orgPath = path.join(basePath, env.orgName);
    fs.mkdirSync(orgPath, {
      recursive: true,
    });
    // Create base organizational folders
    const orgCaPath = path.join(
      basePath,
      env.orgName,
      DeploymentStage.CA,
      "server"
    );
    fs.mkdirSync(orgCaPath, {
      recursive: true,
    });
    const orgTlsPath = path.join(basePath, env.orgName, DeploymentStage.TLS);
    fs.mkdirSync(orgTlsPath, {
      recursive: true,
    });
    // const reporter = new TestReporter();
    // orchestrator.runFunction = (
    //   command: string,
    //   env: { [indexer: string]: any }
    // ) => {
    //   return runAndReport(command, env, StandardOutputWriter, reporter);
    // };
  });

  afterAll(() => {
    logger.info(
      "RUN COMMAND: sudo chown -R $USER:$USER ./tests/infrastructure/storage"
    );
  });

  describe("Boot Infrastructure", () => {
    describe("Tools Container", () => {
      it("Starts Service", async () => {
        try {
          // Resolve container name
          const containerName = `${env.orgName}-${DeploymentStage.TOOLS}`;
          if (await orchestrator.isContainerRunning(containerName)) {
            logger.info(
              `${containerName} is already running. Deployment skipped.`
            );
            return;
          }
          const tools = env.tools;
          logger.info(`Starting container ${containerName}.`);
          const environment = Object.assign({}, process.env, baseEnv, {
            IMAGE: tools.image,
          });
          await orchestrator.serviceUp(
            env.orgName,
            DeploymentStage.TOOLS,
            dockerComposePath,
            { env: environment }
          );
          logger.info(
            `${containerName} started. Waiting for container to become healthy.`
          );
          await orchestrator.awaitContainerReadiness(containerName);
          logger.info(`Container ${containerName} is healthy and ready.`);
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to boot Tools.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
      it("Starts Pharmaledger Service", async () => {
        try {
          // Resolve container name
          const containerName = `${env.pla.toolsAddress}`;
          if (await orchestrator.isContainerRunning(containerName)) {
            logger.info(
              `${containerName} is already running. Deployment skipped.`
            );
            return;
          }
          const tools = env.tools;
          logger.info(`Starting container ${containerName}.`);
          const environment = Object.assign({}, process.env, baseEnv, {
            ORG_NAME: env.pla.orgName,
            IMAGE: tools.image,
          });
          await orchestrator.serviceStart(
            env.pla.orgName,
            DeploymentStage.TOOLS,
            dockerComposePath,
            { env: environment }
          );
          logger.info(
            `${containerName} started. Waiting for container to become healthy.`
          );
          await orchestrator.awaitContainerReadiness(containerName);
          logger.info(`Container ${containerName} is healthy and ready.`);
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to boot Tools.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
    });
    describe("External CA", () => {
      it("Boot External CA", async () => {
        try {
          // Resolve container name
          const containerName = `${env.orgName}-${DeploymentStage.TLS}`;
          if (await orchestrator.containerExists(containerName)) {
            logger.info(
              `TLS CA is already deployed. Skipping certificate generation.`
            );
            return;
          }
          logger.info(`Generating certificates using external CA.`);
          orchestrator.executeCommand(
            `${path.join(__dirname, "../create-pki.sh")}  ./infrastructure ${env.orgName} "${capitalize(env.orgName)} Organization"`
          );
          logger.info(`Certificates generated successfully.`);
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to boot external CA.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
      it("Populates TLS Volume with certificates", async () => {
        try {
          // Resolve container name
          const containerName = `${env.orgName}-${DeploymentStage.TLS}`;
          if (await orchestrator.isContainerRunning(containerName)) {
            logger.info(
              `TLS container is already running. Skipping TLS volume population.`
            );
            return;
          }
          const toolsContainer = `${env.orgName}-${DeploymentStage.TOOLS}`;
          const origin = path.join(
            __dirname,
            STORAGE_DIR_NAME,
            env.orgName,
            DeploymentStage.TLS
          );
          logger.info(`Populating TLS CA volume with generated certificates.`);
          await orchestrator.copyToAndFromContainer(
            toolsContainer,
            path.join(origin, "tls-ca-chain.pem"),
            "/weaver/tls/server/tls-ca-chain.pem"
          );
          logger.info(`Copied tls-ca-chain.pem to TLS CA volume.`);
          await orchestrator.copyToAndFromContainer(
            toolsContainer,
            path.join(origin, "tls-ca.crt"),
            "/weaver/tls/server/tls-ca.crt"
          );
          logger.info(`Copied tls-ca.crt to TLS CA volume.`);
          await orchestrator.copyToAndFromContainer(
            toolsContainer,
            path.join(origin, "tls-ca.key"),
            "/weaver/tls/server/tls-ca.key"
          );
          logger.info(`Copied tls-ca.key to TLS CA volume.`);
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to populate TLS volume.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
      it("Populates CA Volume with certificates", async () => {
        try {
          // Resolve container name
          const containerName = `${env.orgName}-${DeploymentStage.CA}`;
          if (await orchestrator.isContainerRunning(containerName)) {
            logger.info(
              `CA container is already running. Skipping CA volume population.`
            );
            return;
          }
          const toolsContainer = `${env.orgName}-${DeploymentStage.TOOLS}`;
          const origin = path.join(
            __dirname,
            STORAGE_DIR_NAME,
            env.orgName,
            DeploymentStage.CA,
            "server"
          );
          logger.info(`Populating CA volume with generated certificates.`);
          await orchestrator.copyToAndFromContainer(
            toolsContainer,
            path.join(origin, "ca-chain.pem"),
            "/weaver/ca/server/ca-chain.pem"
          );
          logger.info(`Copied ca-chain.pem to CA volume.`);
          await orchestrator.copyToAndFromContainer(
            toolsContainer,
            path.join(origin, "ca.crt"),
            "/weaver/ca/server/ca.crt"
          );
          logger.info(`Copied ca.crt to CA volume.`);
          await orchestrator.copyToAndFromContainer(
            toolsContainer,
            path.join(origin, "ca.key"),
            "/weaver/ca/server/ca.key"
          );
          logger.info(`Copied ca.key to CA volume.`);
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to populate CA volume.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
    });
    describe("TLS CA", () => {
      it("Generates TLS CA Config", async () => {
        try {
          // Resolve container name
          const containerName = `${env.orgName}-${DeploymentStage.TLS}`;
          if (await orchestrator.isContainerRunning(containerName)) {
            logger.info(
              `TLS CA container is already running. Skipping configuration generation.`
            );
            return;
          }
          const cn = `${env.orgName}-${DeploymentStage.TLS}`;
          const tls = env.tls;
          const org = env.org;
          logger.info(
            `Generating TLS CA configuration for organization ${env.orgName}.`
          );
          const dest = path.join(
            __dirname,
            STORAGE_DIR_NAME,
            env.orgName,
            DeploymentStage.TLS
          );
          // Build configuration
          const builder = new FabricCAServerConfigBuilder();
          builder
            .setPort(tls.port)
            .removeUnusedProfiles(false, true)
            .setServerTLS({ enabled: true })
            .setOperations({
              listenAddress: tls.operationsAddress,
            })
            .setCA({
              name: cn,
              keyfile: `/etc/hyperledger/fabric-ca-server/tls-ca.key`,
              certfile: `/etc/hyperledger/fabric-ca-server/tls-ca.crt`,
              chainfile: `/etc/hyperledger/fabric-ca-server/tls-ca-chain.pem`,
            })
            .setCSR({
              ca: {
                pathlength: 0,
              },
              cn: cn,
              hosts: tls.csrHosts.split(","),
              names: [
                {
                  C: org.country,
                  ST: org.state,
                  L: org.locality,
                  O: org.organization,
                  OU: org.organizationUnit,
                },
              ],
            })
            .setIdentities({
              name: tls.user,
              pass: tls.secret,
            })
            .save(dest);
          logger.info(
            `TLS CA configuration generated successfully for organization ${env.orgName}.`
          );
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to generate TLS CA configuration.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
      it("Populates TLS Volume", async () => {
        try {
          // Resolve container name
          const containerName = `${env.orgName}-${DeploymentStage.TLS}`;
          if (await orchestrator.isContainerRunning(containerName)) {
            logger.info(
              `TLS container is already running. Skipping TLS volume population.`
            );
            return;
          }
          const toolsContainer = `${env.orgName}-${DeploymentStage.TOOLS}`;
          const origin = path.join(
            __dirname,
            STORAGE_DIR_NAME,
            env.orgName,
            DeploymentStage.TLS,
            "fabric-ca-server-config.yaml"
          );
          logger.info(
            `Populating TLS volume with Fabric CA server configuration.`
          );
          await orchestrator.copyToAndFromContainer(
            toolsContainer,
            origin,
            "/weaver/tls/server/fabric-ca-server-config.yaml"
          );
          logger.info(
            `Copied fabric-ca-server-config.yaml to TLS volume successfully.`
          );
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to populate TLS volume.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
      it("Starts Service", async () => {
        try {
          // Resolve container name
          const containerName = `${env.orgName}-${DeploymentStage.TLS}`;
          if (await orchestrator.isContainerRunning(containerName)) {
            logger.info(
              `TLS CA container is already running. Skipping deployment.`
            );
            return;
          }
          const tls = env.tls;
          logger.info(
            `Starting TLS CA for organization ${env.orgName} (container: ${containerName}).`
          );
          const environment = Object.assign({}, process.env, baseEnv, {
            IMAGE: tls.image,
            OPERATIONS_ADDRESS: tls.operationsAddress,
            PORT: tls.port,
          });
          await orchestrator.serviceUp(
            env.orgName,
            DeploymentStage.TLS,
            dockerComposePath,
            { env: environment }
          );
          logger.info(
            `TLS CA container ${containerName} started. Waiting for readiness.`
          );
          await orchestrator.awaitContainerReadiness(containerName);
          logger.info(
            `TLS CA container ${containerName} is healthy and ready.`
          );
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to start TLS CA container.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
      it("Registers and Enrolls Identities", async () => {
        try {
          //Resolve Container Name
          const caContainerName = `${env.orgName}-${DeploymentStage.CA}`;
          const tlsContainerName = `${env.orgName}-${DeploymentStage.TLS}`;
          if (await orchestrator.isContainerRunning(caContainerName)) {
            logger.info(
              `CA container ${caContainerName} is already running. Skipping identity registration and enrollment.`
            );
            return;
          }
          const tls = env.tls;
          const ca = env.ca;
          const peer0 = env.peer0;

          logger.info(
            `Registering and enrolling identities using TLS CA container ${tlsContainerName}.`
          );
          //##################################################
          // Enroll Self (TLS CA admin/client bootstrap)
          logger.info(`Enrolling TLS CA client identity (bootstrap).`);
          let builder = new FabricCAClientCommandBuilder();
          let command = builder
            .setCommand(FabricCAClientCommand.ENROLL)
            .setUrl(
              `https://${tls.user}:${tls.secret}@${tlsContainerName}:${tls.port}`
            )
            .build();
          logger.info(`Executing: ${command}`);
          await orchestrator.executeInContainer(
            tlsContainerName,
            command.split(" ")
          );
          //##################################################
          // Copy TLS certificate to shared location
          logger.info(
            `Preparing TLS CA certificate for subsequent operations.`
          );
          command =
            "cp /etc/hyperledger/fabric-ca-server/tls-ca-chain.pem /etc/hyperledger/shared/tls-cert.pem";
          logger.info(`Executing: ${command}`);
          await orchestrator.executeInContainer(
            tlsContainerName,
            command.split(" ")
          );
          //##################################################
          // Register CA identity
          logger.info(`Registering CA identity.`);
          builder = new FabricCAClientCommandBuilder();
          command = builder
            .setUrl(`https://${tlsContainerName}:${tls.port}`)
            .setCommand(FabricCAClientCommand.REGISTER)
            .setIdentity({
              name: ca.user,
              secret: ca.secret,
              type: FabricAccountType.CLIENT,
            })
            .setTLS({
              certfiles: ["/etc/hyperledger/shared/tls-cert.pem"],
            })
            .setMspdir("/etc/hyperledger/client/admin/msp")
            .build();
          logger.info(`Executing: ${command}`);
          await orchestrator.executeInContainer(
            tlsContainerName,
            command.split(" ")
          );
          //##################################################
          // Register CA admin identity
          logger.info(`Registering CA admin identity.`);
          builder = new FabricCAClientCommandBuilder();
          command = builder
            .setUrl(`https://${tlsContainerName}:${tls.port}`)
            .setCommand(FabricCAClientCommand.REGISTER)
            .setIdentity({
              name: ca.admin,
              secret: ca.adminSecret,
              type: FabricAccountType.CLIENT,
            })
            .setTLS({
              certfiles: ["/etc/hyperledger/shared/tls-cert.pem"],
            })
            .setMspdir("/etc/hyperledger/client/admin/msp")
            .build();
          logger.info(`Executing: ${command}`);
          await orchestrator.executeInContainer(
            tlsContainerName,
            command.split(" ")
          );
          //##################################################
          // Enroll CA TLS materials
          logger.info(`Enrolling CA TLS materials.`);
          builder = new FabricCAClientCommandBuilder();
          command = builder
            .setCommand(FabricCAClientCommand.ENROLL)
            .setUrl(
              `https://${ca.user}:${ca.secret}@${tlsContainerName}:${tls.port}`
            )
            .setMspdir("/etc/hyperledger/ca/tls")
            .setEnrollment({
              profile: "tls",
            })
            .setCSR({
              hosts: ca.csrHosts.split(","),
            })
            .setTLS({
              certfiles: ["/etc/hyperledger/shared/tls-cert.pem"],
            })
            .build();
          logger.info(`Executing: ${command}`);
          await orchestrator.executeInContainer(
            tlsContainerName,
            command.split(" ")
          );
          //Renames key for easier usage
          command = `mv /etc/hyperledger/ca/tls/keystore/* /etc/hyperledger/ca/tls/keystore/key.pem`;
          logger.info(`Normalizing CA TLS private key filename.`);
          logger.info(`Executing: ${command}`);
          await orchestrator.exec(tlsContainerName, command, []);
          //##################################################

          // Register Peers
          logger.info(`Registering peer identities.`);
          // Register Peer 0
          builder = new FabricCAClientCommandBuilder();
          command = builder
            .setUrl(`https://${tlsContainerName}:${tls.port}`)
            .setCommand(FabricCAClientCommand.REGISTER)
            .setIdentity({
              name: peer0.user,
              secret: peer0.secret,
              type: FabricAccountType.CLIENT,
            })
            .setTLS({
              certfiles: ["/etc/hyperledger/fabric-ca-server/tls-ca.crt"],
            })
            .setMspdir("/etc/hyperledger/client/admin/msp")
            .build();
          logger.info(`Executing: ${command}`);
          await orchestrator.executeInContainer(
            tlsContainerName,
            command.split(" ")
          );

          builder = new FabricCAClientCommandBuilder();
          command = builder
            .setUrl(`https://${tlsContainerName}:${tls.port}`)
            .setCommand(FabricCAClientCommand.REGISTER)
            .setIdentity({
              name: env.contract.user,
              secret: env.contract.secret,
              type: FabricAccountType.CLIENT,
            })
            .setTLS({
              certfiles: ["/etc/hyperledger/fabric-ca-server/tls-ca.crt"],
            })
            .setMspdir("/etc/hyperledger/client/admin/msp")
            .build();
          logger.info(`Running command: ${command}`);
          await orchestrator.executeInContainer(
            tlsContainerName,
            command.split(" ")
          );

          logger.info(
            `Identity registration and enrollment completed successfully.`
          );
        } catch (e: unknown) {
          err = e;
          logger.error("Error handling identities in the TLS CA", e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
    });
    describe("CA", () => {
      it("Generate CA Server Config", async () => {
        try {
          // Resolve Container Name
          const containerName = `${env.orgName}-${DeploymentStage.CA}`;
          if (await orchestrator.isContainerRunning(containerName)) {
            logger.info(
              `CA container ${containerName} is already running. Skipping configuration generation.`
            );
            return;
          }
          const cn = `${env.orgName}-${DeploymentStage.CA}`;
          const ca = env.ca;
          const org = env.org;
          const hsm = env.hsm;
          const dest = path.join(
            __dirname,
            STORAGE_DIR_NAME,
            env.orgName,
            DeploymentStage.CA,
            "server"
          );
          logger.info(
            `Generating CA server configuration for organization ${env.orgName}.`
          );
          // Build configuration
          const builder = new FabricCAServerConfigBuilder();
          builder
            .setPort(ca.port)
            .removeUnusedProfiles(true, false)
            .setServerTLS({
              enabled: true,
              certfile: "/etc/hyperledger/tls/signcerts/cert.pem",
              keyfile: "/etc/hyperledger/tls/keystore/key.pem",
            })
            .setOperations({
              listenAddress: ca.operationsAddress,
            })
            .setCA({
              name: cn,
              keyfile: `/etc/hyperledger/fabric-ca-server/ca.key`,
              certfile: `/etc/hyperledger/fabric-ca-server/ca.crt`,
              chainfile: `/etc/hyperledger/fabric-ca-server/ca-chain.pem`,
            })
            .setCSR({
              ca: {
                pathlength: 0,
              },
              cn: cn,
              hosts: ca.csrHosts.split(","),
              names: [
                {
                  C: org.country,
                  ST: org.state,
                  L: org.locality,
                  O: org.organization,
                  OU: org.organizationUnit,
                },
              ],
            })
            .setIdentities({
              name: ca.user,
              pass: ca.secret,
            });
          if (hsm.enabled)
            builder.setBCCSP({
              default: "PKCS11",
              pkcs11: {
                Library: hsm.lib,
                Pin: hsm.pin,
                Label: hsm.label,
                hash: "SHA2",
                security: 256,
                Immutable: false,
                ...(hsm.altId ? { AltID: hsm.altId } : {}),
              },
            } as unknown as BCCSPConfig);
          builder.save(dest);
          logger.info(
            `CA server configuration generated successfully for organization ${env.orgName}.`
          );
        } catch (e: unknown) {
          err = e;
          logger.error(
            `Failed to generate CA server configuration.`,
            e as Error
          );
          expect(e).toBeUndefined();
          return;
        }
      });
      it("Populates CA Volume", async () => {
        try {
          // Resolve container name
          const containerName = `${env.orgName}-${DeploymentStage.CA}`;
          if (await orchestrator.isContainerRunning(containerName)) {
            logger.info(
              `CA container ${containerName} is already running. Skipping CA volume population.`
            );
            return;
          }
          const toolsContainer = `${env.orgName}-${DeploymentStage.TOOLS}`;
          const origin = path.join(
            __dirname,
            STORAGE_DIR_NAME,
            env.orgName,
            DeploymentStage.CA,
            "server",
            "fabric-ca-server-config.yaml"
          );
          logger.info(
            `Populating CA volume with Fabric CA server configuration.`
          );
          await orchestrator.copyToAndFromContainer(
            toolsContainer,
            origin,
            "/weaver/ca/server/fabric-ca-server-config.yaml"
          );
          logger.info(
            `Fabric CA server configuration copied to CA volume successfully.`
          );
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to populate CA volume.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
      it("Starts Service", async () => {
        try {
          // Resolve container name
          const containerName = `${env.orgName}-${DeploymentStage.CA}`;
          //Check if container is already running. Skipping if already running...
          if (await orchestrator.isContainerRunning(containerName)) {
            logger.info(
              `CA container ${containerName} is already running. Skipping startup.`
            );
            return;
          }
          logger.info(
            `Starting CA service for organization ${env.orgName} (container: ${containerName}).`
          );
          const environment = Object.assign({}, process.env, baseEnv, {
            IMAGE: env.ca.image,
            OPERATIONS_ADDRESS: env.ca.operationsAddress,
            PORT: env.ca.port,
          });
          // Start CA service
          await orchestrator.serviceUp(
            env.orgName,
            DeploymentStage.CA,
            dockerComposePath,
            { env: environment }
          );
          logger.info(
            `CA container ${containerName} started. Waiting for readiness.`
          );
          await orchestrator.awaitContainerReadiness(containerName);
          logger.info(`CA container ${containerName} is healthy and ready.`);
        } catch (e: unknown) {
          err = e;
          expect(e).toBeUndefined();
          return;
        }
      });
      it("Registers/Enrolls CA Identities", async () => {
        try {
          const peerName = `${DeploymentStage.PEER}-0`;
          //Resolve Container Name
          const containerName = `${env.orgName}-${DeploymentStage.CA}`;
          const peerContainerName = `${env.orgName}-${peerName}`;
          if (await orchestrator.isContainerRunning(peerContainerName)) {
            logger.info(
              `Peer-0 container ${peerContainerName} is already running. Skipping CA identity registration and enrollment.`
            );
            return;
          }
          const ca = env.ca;
          const tls = env.tls;
          logger.info(
            `Registering and enrolling CA identities for organization ${env.orgName} (CA container: ${containerName}).`
          );
          //######################################################
          // Enroll Server CA identity
          logger.info(`Enrolling CA bootstrap identity.`);
          let builder = new FabricCAClientCommandBuilder();
          let command = builder
            .setCommand(FabricCAClientCommand.ENROLL)
            .setHome(`/etc/hyperledger/client/client`)
            .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
            .setUrl(
              `https://${ca.user}:${ca.secret}@${env.orgName}-${DeploymentStage.CA}:${ca.port}`
            )
            .build();
          logger.info(`Executing: ${command}`);
          await orchestrator.executeInContainer(
            containerName,
            command.split(" ")
          );
          //########################################################
          // Admin Identity (register + enroll)
          logger.info(`Registering CA admin identity.`);
          builder = new FabricCAClientCommandBuilder();
          command = builder
            .setCommand(FabricCAClientCommand.REGISTER)
            .setIdentity({
              name: ca.admin,
              secret: ca.adminSecret,
              type: FabricAccountType.ADMIN,
            })
            .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
            .setMspdir("/etc/hyperledger/client/client/msp")
            .build();
          logger.info(`Executing: ${command}`);
          await orchestrator.executeInContainer(
            containerName,
            command.split(" ")
          );
          logger.info(`Enrolling CA admin TLS identity.`);
          builder = new FabricCAClientCommandBuilder();
          command = builder
            .setCommand(FabricCAClientCommand.ENROLL)
            .setEnrollment({ profile: "tls" })
            .setHome(`/etc/hyperledger/client/admin/tls`)
            .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
            .setCSR({
              hosts: ca.adminCsrHosts?.split(","),
            })
            .setUrl(
              `https://${ca.admin}:${ca.adminSecret}@${env.orgName}-${DeploymentStage.TLS}:${tls.port}`
            )
            .build();
          logger.info(`Executing: ${command}`);
          await orchestrator.executeInContainer(
            containerName,
            command.split(" ")
          );
          logger.info(`Enrolling CA admin (CA MSP).`);
          builder = new FabricCAClientCommandBuilder();
          command = builder
            .setCommand(FabricCAClientCommand.ENROLL)
            .setHome(`/etc/hyperledger/client/admin/ca`)
            .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
            .setCSR({
              hosts: ca.adminCsrHosts!.split(","),
            })
            .setUrl(
              `https://${ca.admin}:${ca.adminSecret}@${env.orgName}-${DeploymentStage.CA}:${ca.port}`
            )
            .build();
          logger.info(`Executing: ${command}`);
          await orchestrator.executeInContainer(
            containerName,
            command.split(" ")
          );
          logger.info(
            `CA identity registration and enrollment completed successfully for ${env.orgName}.`
          );
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to register/enroll CA identities.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
      it("Create NodeOU config files for ca identities and populate the volumes", async () => {
        try {
          const peerContainerName = `${env.orgName}-peer-0`;
          const caContainerName = `${env.orgName}-${DeploymentStage.CA}`;
          //Check if container is already running. Skipping if already running...
          if (await orchestrator.isContainerRunning(peerContainerName)) {
            logger.info(
              `Peer-0 container ${peerContainerName} is already running. Skipping CA admin NodeOU configuration generation and volume population.`
            );
            return;
          }
          logger.info(
            `Generating CA admin NodeOU configuration for organization ${env.orgName}.`
          );
          const basePath = path.join(
            __dirname,
            STORAGE_DIR_NAME,
            env.orgName,
            DeploymentStage.CA,
            "client",
            "admin"
          );
          const mspPath = path.join(basePath, DeploymentStage.CA, "msp");
          fs.mkdirSync(mspPath, { recursive: true });
          const nodeOU = {
            NodeOUs: {
              Enable: true,
              ClientOUIdentifier: {
                Certificate: `intermediatecerts/${env.orgName}-${DeploymentStage.CA}-${env.ca.port}.pem`,
                OrganizationalUnitIdentifier: FabricAccountType.CLIENT,
              },
              AdminOUIdentifier: {
                Certificate: `intermediatecerts/${env.orgName}-${DeploymentStage.CA}-${env.ca.port}.pem`,
                OrganizationalUnitIdentifier: FabricAccountType.ADMIN,
              },
              PeerOUIdentifier: {
                Certificate: `intermediatecerts/${env.orgName}-${DeploymentStage.CA}-${env.ca.port}.pem`,
                OrganizationalUnitIdentifier: FabricAccountType.PEER,
              },
              OrdererOUIdentifier: {
                Certificate: `intermediatecerts/${env.orgName}-${DeploymentStage.CA}-${env.ca.port}.pem`,
                OrganizationalUnitIdentifier: FabricAccountType.ORDERER,
              },
            },
          };
          const location = path.join(mspPath, "config.yaml");
          writeFileYaml<any>(location, nodeOU);
          logger.info(
            `Copying CA admin NodeOU config.yaml into CA container ${caContainerName}.`
          );
          await orchestrator.copyToAndFromContainer(
            caContainerName,
            location,
            "/etc/hyperledger/client/admin/ca/msp/config.yaml"
          );
          logger.info(
            `CA admin NodeOU config.yaml copied successfully to ${caContainerName} at /etc/hyperledger/client/admin/ca/msp/config.yaml.`
          );
        } catch (e: unknown) {
          err = e;
          logger.error(
            `Failed to generate or populate NodeOU configuration.`,
            e as Error
          );
          expect(e).toBeUndefined();
          return;
        }
      });
      it("Registers/Enrolls Peers Identities", async () => {
        try {
          const peerName = `${DeploymentStage.PEER}-0`;
          //Resolve Container Name
          const containerName = `${env.orgName}-${DeploymentStage.CA}`;
          const peerContainerName = `${env.orgName}-${peerName}`;
          if (await orchestrator.isContainerRunning(peerContainerName)) {
            logger.info(
              `Peer container ${peerContainerName} is already running. Skipping identity registration and enrollment.`
            );
            return;
          }
          const ca = env.ca;
          const tls = env.tls;
          const peer0 = env.peer0;
          //########################################################
          // Handle Peers
          logger.info(
            `Registering and enrolling peer identities for organization ${env.orgName} (CA container: ${containerName}).`
          );
          // Peer 0
          // Register with CA
          logger.info(`Registering peer-0 with CA.`);
          let builder = new FabricCAClientCommandBuilder();
          let command = builder
            .setCommand(FabricCAClientCommand.REGISTER)
            .setIdentity({
              name: peer0.user,
              secret: peer0.secret,
              type: FabricAccountType.PEER,
            })
            .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
            .setMspdir("/etc/hyperledger/client/client/msp")
            .build();
          logger.info(`Executing: ${command}`);
          await orchestrator.executeInContainer(
            containerName,
            command.split(" ")
          );
          // Enroll peer TLS
          logger.info(`Enrolling peer-0 TLS identity.`);
          builder = new FabricCAClientCommandBuilder();
          command = builder
            .setCommand(FabricCAClientCommand.ENROLL)
            .setEnrollment({ profile: "tls" })
            .setHome(`/etc/hyperledger/client/peers/peer-0/tls`)
            .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
            .setCSR({
              hosts: peer0.csrHosts.split(","),
            })
            .setUrl(
              `https://${peer0.user}:${peer0.secret}@${env.orgName}-${DeploymentStage.TLS}:${tls.port}`
            )
            .build();
          logger.info(`Executing: ${command}`);
          await orchestrator.executeInContainer(
            containerName,
            command.split(" ")
          );
          // Enroll peer CA MSP
          logger.info(`Enrolling peer-0 CA identity (MSP).`);
          builder = new FabricCAClientCommandBuilder();
          command = builder
            .setCommand(FabricCAClientCommand.ENROLL)
            .setHome(`/etc/hyperledger/client/peers/peer-0/ca`)
            .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
            .setCSR({
              hosts: peer0.csrHosts.split(","),
            })
            .setUrl(
              `https://${peer0.user}:${peer0.secret}@${env.orgName}-${DeploymentStage.CA}:${ca.port}`
            )
            .build();
          logger.info(`Executing: ${command}`);
          await orchestrator.executeInContainer(
            containerName,
            command.split(" ")
          );
          // Normalize key filename
          logger.info(`Normalizing peer-0 TLS private key filename.`);
          command = `mv /etc/hyperledger/client/peers/peer-0/tls/msp/keystore/* /etc/hyperledger/client/peers/peer-0/tls/msp/keystore/key.pem`;
          logger.info(`Executing: ${command}`);
          await orchestrator.exec(containerName, command, []);
          // Copy admin MSP for channel operations
          logger.info(`Copying admin MSP to peer-0 directory.`);
          command = `cp -r /etc/hyperledger/client/admin /etc/hyperledger/client/peers/peer-0/`;
          logger.info(`Executing: ${command}`);
          await orchestrator.exec(containerName, command, []);
        } catch (e: unknown) {
          err = e;
          expect(e).toBeUndefined();
          return;
        }
      });
      it("Registers/Enrolls CCAAS Identity", async () => {
        try {
          const peerName = `${DeploymentStage.PEER}-0`;
          //Resolve Container Name
          const containerName = `${env.orgName}-${DeploymentStage.CA}`;
          const peerContainerName = `${env.orgName}-${peerName}`;
          if (await orchestrator.isContainerRunning(peerContainerName)) {
            logger.info(
              `Peer container ${peerContainerName} is already running. Skipping identity registration and enrollment.`
            );
            return;
          }
          const tls = env.tls;
          const builder = new FabricCAClientCommandBuilder();
          let command = builder
            .setCommand(FabricCAClientCommand.ENROLL)
            .setEnrollment({ profile: "tls" })
            .setHome(`/etc/hyperledger/ccaas`)
            .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
            .setCSR({
              hosts: env.contract.csrHosts.split(","),
            })
            .setUrl(
              `https://${env.contract.user}:${env.contract.secret}@${env.orgName}-tls:${tls.port}`
            )
            .build();
          logger.info(`Running command: ${command}`);
          await orchestrator.executeInContainer(
            containerName,
            command.split(" ")
          );
          // Renames key for easier usage
          command = `mv /etc/hyperledger/ccaas/msp/keystore/* /etc/hyperledger/ccaas/msp/keystore/key.pem`;
          logger.info(`Running command: ${command}`);
          await orchestrator.exec(containerName, command, []);
          command = `cp -r /etc/hyperledger/ccaas/msp/tlsintermediatecerts/tls-${env.orgName}-tls-${tls.port}.pem \
                   /etc/hyperledger/ccaas/tls-cert.pem`;
          logger.info(`Running command: ${command}`);
          await orchestrator.exec(containerName, command, []);
          //Copy tls client certificate for ccaas usage
          command = `cp -r /etc/hyperledger/ccaas/msp/signcerts/cert.pem \
                   /etc/hyperledger/ccaas/tls-client-cert.pem`;
          logger.info(`Running command: ${command}`);
          await orchestrator.exec(containerName, command, []);
          command = `cp -r /etc/hyperledger/ccaas/msp/keystore/key.pem \
                   /etc/hyperledger/ccaas/tls-client-key.pem`;
          logger.info(`Running command: ${command}`);
          await orchestrator.exec(containerName, command, []);
          command =
            "cp /etc/hyperledger/shared/tls-cert.pem /etc/hyperledger/client/tls-cert.pem";
          await orchestrator.exec(containerName, command, []);
        } catch (e: unknown) {
          err = e;
          expect(e).toBeUndefined();
          return;
        }
      });
      it("Create Organization MSP", async () => {
        try {
          //Resolve Container Name
          const containerName = `${env.orgName}-${DeploymentStage.CA}`;
          const peerContainerName = `${env.orgName}-${DeploymentStage.PEER}-0`;
          //Check if container is already running. Skipping if already running...
          if (await orchestrator.isContainerRunning(peerContainerName)) {
            logger.info(
              `Peer-0 container ${peerContainerName} is already running. Skipping organization MSP generation.`
            );
            return;
          }
          logger.info(
            `Generating organization MSP for ${env.orgName} (CA container: ${containerName}).`
          );
          const mspFolder = path.join(
            __dirname,
            STORAGE_DIR_NAME,
            env.orgName,
            "msp"
          );
          fs.mkdirSync(mspFolder, { recursive: true });
          const nodeOU = {
            NodeOUs: {
              Enable: true,
              ClientOUIdentifier: {
                Certificate: `intermediatecerts/${env.orgName}-${DeploymentStage.CA}-${env.ca.port}.pem`,
                OrganizationalUnitIdentifier: FabricAccountType.CLIENT,
              },
              AdminOUIdentifier: {
                Certificate: `intermediatecerts/${env.orgName}-${DeploymentStage.CA}-${env.ca.port}.pem`,
                OrganizationalUnitIdentifier: FabricAccountType.ADMIN,
              },
              OrdererOUIdentifier: {
                Certificate: `intermediatecerts/${env.orgName}-${DeploymentStage.CA}-${env.ca.port}.pem`,
                OrganizationalUnitIdentifier: FabricAccountType.ORDERER,
              },
              PeerOUIdentifier: {
                Certificate: `intermediatecerts/${env.orgName}-${DeploymentStage.CA}-${env.ca.port}.pem`,
                OrganizationalUnitIdentifier: FabricAccountType.PEER,
              },
            },
          };
          const location = path.join(mspFolder, "config.yaml");
          writeFileYaml<any>(location, nodeOU);
          logger.info(
            `Copying organization MSP config.yaml into CA container ${containerName}.`
          );
          await orchestrator.copyToAndFromContainer(
            containerName,
            location,
            "/etc/hyperledger/org-msp/config.yaml"
          );
          logger.info(
            `Organization MSP config.yaml copied to ${containerName} at /etc/hyperledger/org-msp/config.yaml.`
          );
          // Copy certificates
          const basePath = "/etc/hyperledger/org-msp/";
          const caCertsPath = `${basePath}cacerts`;
          let command = `mkdir -p ${caCertsPath}`;
          await orchestrator.exec(containerName, command, []);
          command = `cp /etc/hyperledger/client/admin/ca/msp/cacerts/* ${caCertsPath}/`;
          logger.debug(
            `Copying CA root certs into org MSP (command: ${command}).`
          );
          await orchestrator.exec(containerName, command, []);
          const signCertsPath = `${basePath}signcerts`;
          command = `mkdir -p ${signCertsPath}`;
          await orchestrator.exec(containerName, command, []);
          command = `cp /etc/hyperledger/client/admin/ca/msp/signcerts/* ${signCertsPath}/`;
          logger.debug(
            `Copying CA signcerts into org MSP (command: ${command}).`
          );
          await orchestrator.exec(containerName, command, []);
          const tlsCACertsPath = `${basePath}tlscacerts`;
          command = `mkdir -p ${tlsCACertsPath}`;
          await orchestrator.exec(containerName, command, []);
          command = `cp /etc/hyperledger/client/admin/tls/msp/tlscacerts/* ${tlsCACertsPath}/`;
          logger.debug(
            `Copying TLS CA certs into org MSP (command: ${command}).`
          );
          await orchestrator.exec(containerName, command, []);
          const tlsIntermediateCertsPath = `${basePath}tlsintermediatecerts`;
          command = `mkdir -p ${tlsIntermediateCertsPath}`;
          await orchestrator.exec(containerName, command, []);
          command = `cp /etc/hyperledger/client/admin/tls/msp/tlsintermediatecerts/* ${tlsIntermediateCertsPath}/`;
          logger.debug(
            `Copying TLS intermediate certs into org MSP (command: ${command}).`
          );
          await orchestrator.exec(containerName, command, []);
          const intermediateCertsPath = `${basePath}intermediatecerts`;
          command = `mkdir -p ${intermediateCertsPath}`;
          await orchestrator.exec(containerName, command, []);
          command = `cp /etc/hyperledger/client/admin/ca/msp/intermediatecerts/* ${intermediateCertsPath}/`;
          logger.debug(
            `Copying CA intermediate certs into org MSP (command: ${command}).`
          );
          await orchestrator.exec(containerName, command, []);
          logger.info(
            `Organization MSP generated and populated successfully for ${env.orgName}.`
          );
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to generate organization MSP.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
    });
    describe("Peers", () => {
      describe("Peer-0", () => {
        it("Starts DB Service", async () => {
          try {
            // Resolve container name
            const containerName = `${env.orgName}-${DeploymentStage.PEER}-0-${DeploymentStage.COUCHDB}`;
            if (await orchestrator.isContainerRunning(containerName)) {
              logger.info(
                `Peer-0 CouchDB container ${containerName} is already running. Skipping startup.`
              );
              return;
            }
            const peer = env.peer0;
            logger.info(
              `Starting CouchDB service for peer-0 (org: ${env.orgName}, container: ${containerName}).`
            );
            const environment = Object.assign({}, process.env, baseEnv, {
              COUCHDB_IMAGE: peer.couchdbImage,
              COUCHDB_USER: peer.couchdbUser,
              COUCHDB_SECRET: peer.couchdbSecret,
              ORG_NAME: env.orgName,
              COUCHDB_PORT: peer.couchdbPort,
            });
            // Start Orderer service
            await orchestrator.serviceUp(
              env.orgName,
              `${DeploymentStage.PEER}-0-${DeploymentStage.COUCHDB}`,
              dockerComposePath,
              { env: environment }
            );
            logger.info(
              `Peer-0 CouchDB container ${containerName} started. Waiting for readiness.`
            );
            await orchestrator.awaitContainerReadiness(containerName);
            logger.info(
              `Peer-0 CouchDB container ${containerName} is healthy and ready.`
            );
          } catch (e: unknown) {
            err = e;
            logger.error(
              `Failed to start Peer-0 CouchDB container.`,
              e as Error
            );
            expect(e).toBeUndefined();
            return;
          }
        });
        it("Generates Peer Config", async () => {
          try {
            // Resolve container name
            const containerName = `${env.orgName}-${DeploymentStage.PEER}-0`;
            if (await orchestrator.isContainerRunning(containerName)) {
              logger.info(
                `Peer-0 container ${containerName} is already running. Skipping configuration generation.`
              );
              return;
            }
            const peer = env.peer0;
            const hsm = env.hsm;
            logger.info(
              `Generating Peer-0 configuration for organization ${env.orgName}.`
            );
            const basePeerPath = path.join(
              __dirname,
              STORAGE_DIR_NAME,
              env.orgName,
              DeploymentStage.CA,
              "client",
              "peers"
            );
            const peerMspPath = path.join(
              basePeerPath,
              `${DeploymentStage.PEER}-0`,
              DeploymentStage.CA
            );
            fs.mkdirSync(peerMspPath, { recursive: true });
            // Build configuration
            const builder = new FabricPeerConfigBuilder();
            builder
              .setGossip({
                bootstrap: `127.0.0.1:${peer.port}`,
                externalEndpoint: `${env.orgName}-${DeploymentStage.PEER}-0:${peer.port}`, //This should be the public hostname and port
              })
              .setTLS({
                enabled: true,
                cert: {
                  file: `/etc/hyperledger/fabric/tls/msp/signcerts/cert.pem`,
                },
                key: {
                  file: `/etc/hyperledger/fabric/tls/msp/keystore/key.pem`,
                },
                rootcert: {
                  file: `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${env.orgName}-tls-${env.tls.port}.pem`, // `/etc/hyperledger/shared/tls-cert.pem`,
                },
                clientRootCAs: {
                  files: [
                    `/etc/hyperledger/fabric/tls/msp/tlscacerts/tls-${env.orgName}-tls-${env.tls.port}.pem`,
                  ], //`/etc/hyperledger/shared/tls-cert.pem`],
                },
                clientKey: {
                  file: `/etc/hyperledger/fabric/tls/msp/keystore/key.pem`,
                },
                clientCert: {
                  file: `/etc/hyperledger/fabric/tls/msp/signcerts/cert.pem`,
                },
              })
              .setGeneral({
                id: `${env.orgName}-${DeploymentStage.PEER}-0`,
                networkId: `${env.orgName}_network`,
                address: `${env.orgName}-${DeploymentStage.PEER}-0:${peer.port}`,
                listenAddress: `0.0.0.0:${peer.port}`,
                fileSystemPath: `/etc/hyperledger/fabric/production`,
                chaincodeListenAddress: `0.0.0.0:${peer.chaincodePort}`, //`${name}-${peer.name}:${p.PEER_CHAINCODE_PORT}`,
              })
              .setOperations({
                listenAddress: peer.operationsAddress,
              })
              .setMspConfig({
                localMspId: `${capitalize(env.orgName.toLowerCase())}MSP`,
                mspConfigPath: `/etc/hyperledger/fabric/ca/msp`,
              })
              .setLedgerState({
                stateDatabase: "CouchDB",
                couchDBConfig: {
                  username: peer.couchdbUser,
                  password: peer.couchdbSecret,
                  couchDBAddress: `${env.orgName}-${DeploymentStage.PEER}-0-${DeploymentStage.COUCHDB}:5984`, // Hardcoding since it is using internal network
                },
              })
              .setVMOptions({
                docker: {
                  hostConfig: {
                    NetworkMode: `${env.orgName}_network`,
                  },
                },
              })
              .setLedgerSnapshotsRootDir(
                `/etc/hyperledger/fabric/production/snapshot-dir`
              )
              .setChaincode({
                externalBuilders: [
                  {
                    name: "ccaas",
                    path: "/opt/hyperledger/ccaas_builder",
                    propagateEnvironment: [
                      "CHAINCODE_AS_A_SERVICE_BUILDER_CONFIG",
                    ],
                  },
                ],
              });
            if (hsm.enabled)
              builder.setBCCSP({
                Default: "PKCS11",
                PKCS11: {
                  Library: hsm.lib,
                  Pin: hsm.pin.toString(),
                  Label: hsm.label,
                  Hash: "SHA2",
                  Security: 256,
                  Immutable: false,
                  ...(hsm.altId ? { AltID: hsm.altId } : {}),
                },
              });
            builder.save(peerMspPath);
            logger.info(
              `Peer-0 configuration generated successfully for organization ${env.orgName}.`
            );
          } catch (e: unknown) {
            err = e;
            logger.error(
              `Failed to generate Peer-0 configuration.`,
              e as Error
            );
            expect(e).toBeUndefined();
            return;
          }
        });
        it("Create NodeOU config files and populate the volumes", async () => {
          try {
            const peerContainerName = `${env.orgName}-peer-0`;
            if (await orchestrator.isContainerRunning(peerContainerName)) {
              logger.info(
                `Peer container ${peerContainerName} is already running. Skipping NodeOU configuration generation.`
              );
              return;
            }
            logger.info(
              `Generating NodeOU configuration for peer-0 MSP (org: ${env.orgName}).`
            );
            const basePeerPath = path.join(
              __dirname,
              STORAGE_DIR_NAME,
              env.orgName,
              DeploymentStage.CA,
              "client",
              "peers"
            );
            const peerFolder = path.join(
              basePeerPath,
              "peer-0",
              DeploymentStage.CA
            );
            const mspPath = path.join(peerFolder, "msp");
            fs.mkdirSync(mspPath, { recursive: true });
            const nodeOU = {
              NodeOUs: {
                Enable: true,
                ClientOUIdentifier: {
                  Certificate: `intermediatecerts/${env.orgName}-${DeploymentStage.CA}-${env.ca.port}.pem`,
                  OrganizationalUnitIdentifier: FabricAccountType.CLIENT,
                },
                AdminOUIdentifier: {
                  Certificate: `intermediatecerts/${env.orgName}-${DeploymentStage.CA}-${env.ca.port}.pem`,
                  OrganizationalUnitIdentifier: FabricAccountType.ADMIN,
                },
                PeerOUIdentifier: {
                  Certificate: `intermediatecerts/${env.orgName}-${DeploymentStage.CA}-${env.ca.port}.pem`,
                  OrganizationalUnitIdentifier: FabricAccountType.PEER,
                },
              },
            };
            const location = path.join(mspPath, "config.yaml");
            writeFileYaml<any>(location, nodeOU);
            logger.info(
              `NodeOU configuration written successfully to ${location}.`
            );
          } catch (e: unknown) {
            err = e;
            logger.error(
              `Failed to generate NodeOU configuration for peer-0 MSP.`,
              e as Error
            );
            expect(e).toBeUndefined();
            return;
          }
        });
        it("Populates Peer Volume", async () => {
          try {
            // Resolve container name
            const containerName = `${env.orgName}-${DeploymentStage.PEER}-0`;
            const caContainerName = `${env.orgName}-${DeploymentStage.CA}`;
            if (await orchestrator.isContainerRunning(containerName)) {
              logger.info(
                `Peer-0 container ${containerName} is already running. Skipping peer volume population.`
              );
              return;
            }
            const basePeerPath = path.join(
              __dirname,
              STORAGE_DIR_NAME,
              env.orgName,
              DeploymentStage.CA,
              "client",
              "peers"
            );
            const peerFolder = path.join(
              basePeerPath,
              "peer-0",
              DeploymentStage.CA
            );
            const mspPath = path.join(peerFolder, "msp/config.yaml");
            const peerPath = path.join(peerFolder, "core.yaml");
            logger.info(
              `Populating Peer-0 volume in CA container ${caContainerName} with MSP and peer configuration.`
            );
            await orchestrator.copyToAndFromContainer(
              caContainerName,
              mspPath,
              "/etc/hyperledger/client/peers/peer-0/ca/msp/config.yaml"
            );
            logger.info(
              `Copied peer-0 MSP config.yaml to CA container ${caContainerName}.`
            );
            await orchestrator.copyToAndFromContainer(
              caContainerName,
              peerPath,
              "/etc/hyperledger/client/peers/peer-0/ca/core.yaml"
            );
            logger.info(
              `Copied peer-0 core.yaml to CA container ${caContainerName}.`
            );
          } catch (e: unknown) {
            err = e;
            logger.error(`Failed to populate Peer-0 volume.`, e as Error);
            expect(e).toBeUndefined();
            return;
          }
        });
        it("Starts Service", async () => {
          try {
            // Resolve container name
            const containerName = `${env.orgName}-${DeploymentStage.PEER}-0`;
            if (await orchestrator.isContainerRunning(containerName)) {
              logger.info(
                `Peer-0 container ${containerName} is already running. Skipping startup.`
              );
              return;
            }
            const peer = env.peer0;
            logger.info(
              `Starting Peer-0 service for organization ${env.orgName} (container: ${containerName}).`
            );
            const environment = Object.assign({}, process.env, baseEnv, {
              IMAGE: peer.image,
              PLA_ORG_NAME: env.pla.orgName,
              OPERATIONS_ADDRESS: peer.operationsAddress,
              PORT: peer.port,
            });
            // Start Orderer service
            await orchestrator.serviceUp(
              env.orgName,
              `${DeploymentStage.PEER}-0`,
              dockerComposePath,
              { env: environment }
            );
            logger.info(
              `Peer-0 container ${containerName} started. Waiting for readiness.`
            );
            await orchestrator.awaitContainerReadiness(containerName);
            logger.info(
              `Peer-0 container ${containerName} is healthy and ready.`
            );
          } catch (e: unknown) {
            err = e;
            logger.error(`Failed to start Peer-0 container.`, e as Error);
            expect(e).toBeUndefined();
            return;
          }
        });
      });
    });
    describe("Channel", () => {
      let peerJoinedChannel = false;

      it("Join Organization to the channel", async () => {
        try {
          const peerContainerName = `${env.orgName}-${DeploymentStage.PEER}-0`;
          const caContainerName = `${env.orgName}-${DeploymentStage.CA}`;
          const containerName = `${env.orgName}-${DeploymentStage.TOOLS}`;
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
          const channel = env.channel;
          let command = `peer channel list`;

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
            `Existing channels on ${env.orgName}:\n${channelList.toString()}`
          );
          if (peerJoinedChannel) {
            logger.info(
              `Peer already joined channel "${channel.name}". Skipping configtx.yaml generation and copy.`
            );
            return;
          }
          fs.mkdirSync(path.join(__dirname, "./tmp/temp"), {
            recursive: true,
          });

          await orchestrator.exec(
            `${env.pla.peerAddress}`,
            "mkdir -p ./tmp/temp",
            []
          );

          const replacements = {
            ORG_NAME: capitalize(env.orgName.toLowerCase()),
            ORG_MSPID: capitalize(env.orgName.toLowerCase()) + "MSP",
            ORG_MSPDIR: "/tmp/temp/org-msp",
          };

          copyAndOverrideYaml(
            path.join(__dirname, "../../docker/orgtx.yaml"),
            path.join(__dirname, "./tmp/temp/configtx.yaml"),
            replacements
          );

          await orchestrator.copyToAndFromContainer(
            `${env.pla.peerAddress}`,
            path.join(__dirname, "./tmp/temp/configtx.yaml"),
            `./tmp/temp/configtx.yaml`,
            "to"
          );

          await orchestrator.copyToAndFromContainer(
            `${env.pla.ordererAddress}`,
            `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${env.pla.orgName}-tls-${env.pla.tlsPort}.pem`,
            path.join(__dirname, "./tmp/temp/orderer-tls.pem"),
            "from"
          );

          await orchestrator.copyToAndFromContainer(
            `${peerContainerName}`,
            path.join(__dirname, "./tmp/temp/orderer-tls.pem"),
            `/etc/hyperledger/fabric/orderer-tls.pem`,
            "to"
          );

          await orchestrator.copyToAndFromContainer(
            `${env.pla.toolsAddress}`,
            `/weaver/shared/peer-0-tls.pem`,
            path.join(__dirname, "./tmp/temp/peer-0-tls.pem"),
            "from"
          );

          await orchestrator.copyToAndFromContainer(
            `${env.pla.toolsAddress}`,
            `/weaver/shared/peer-1-tls.pem`,
            path.join(__dirname, "./tmp/temp/peer-1-tls.pem"),
            "from"
          );

          await orchestrator.copyToAndFromContainer(
            `${env.pla.toolsAddress}`,
            `/weaver/shared/peer-2-tls.pem`,
            path.join(__dirname, "./tmp/temp/peer-2-tls.pem"),
            "from"
          );

          await orchestrator.copyToAndFromContainer(
            `${caContainerName}`,
            path.join(__dirname, "./tmp/temp/peer-0-tls.pem"),
            `/etc/hyperledger/client/pla-peer-0-tls.pem`,
            "to"
          );

          await orchestrator.copyToAndFromContainer(
            `${caContainerName}`,
            path.join(__dirname, "./tmp/temp/peer-1-tls.pem"),
            `/etc/hyperledger/client/pla-peer-1-tls.pem`,
            "to"
          );

          await orchestrator.copyToAndFromContainer(
            `${caContainerName}`,
            path.join(__dirname, "./tmp/temp/peer-2-tls.pem"),
            `/etc/hyperledger/client/pla-peer-2-tls.pem`,
            "to"
          );

          if (env.onPrem) {
            // Add logic for on prem join
          } else {
            await orchestrator.copyToAndFromContainer(
              `${env.orgName}-ca`,
              `/etc/hyperledger/org-msp`,
              path.join(__dirname, "./tmp/temp"),
              "from"
            );

            await orchestrator.copyToAndFromContainer(
              `${env.pla.peerAddress}`,
              path.join(__dirname, "./tmp/temp/org-msp"),
              `/tmp/temp`,
              "to"
            );
          }

          let peerChannelBuilder = new FabricPeerChannelCommandBuilder();

          command = peerChannelBuilder
            .setCommand(PeerChannelCommands.FETCH)
            .setBlockReference("config")
            .setDestination("./tmp/temp/config_block.pb")
            .setChannelID(env.channel.name)
            .setOrderer(`${env.pla.ordererAddress}:${env.pla.ordererPort}`)
            .enableTLS(true)
            .setTLSCAFile(
              `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${env.pla.orgName}-tls-${env.pla.tlsPort}.pem`
            )
            .build();

          logger.info(`Running command: ${command}`);

          await orchestrator.exec(`${env.pla.peerAddress}`, command, [
            `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
          ]);

          let configtxlatorBuilder = new ConfigtxlatorCommandBuilder();

          command = configtxlatorBuilder
            .setCommand(ConfigtxlatorCommand.PROTO_DECODE)
            .setProtoOptions({
              input: "./tmp/temp/config_block.pb",
              type: ConfigtxlatorProtoMessage.BLOCK,
              output: "./tmp/temp/config_block.json",
            })
            .build();

          await orchestrator.executeInContainer(
            `${env.pla.toolsAddress}`,
            command.split(" ")
          );

          command = `jq .data.data[0].payload.data.config ./tmp/temp/config_block.json > ./tmp/temp/config.json`;

          await orchestrator.exec(`${env.pla.toolsAddress}`, command, []);

          command = `configtxgen -printOrg ${capitalize(env.orgName)} > ./tmp/temp/org.json`;

          await orchestrator.exec(`${env.pla.toolsAddress}`, command, [
            `FABRIC_CFG_PATH=/tmp/temp`,
          ]);

          const org = capitalize(env.orgName);

          command =
            `jq -s --arg org "${org}" ` +
            // eslint-disable-next-line no-useless-escape
            `".[0] * {\\\"channel_group\\\":{\\\"groups\\\":{\\\"Application\\\":{\\\"groups\\\":{(\\$org):.[1]}}}}}" ` +
            `/tmp/temp/config.json /tmp/temp/org.json ` +
            `> /tmp/temp/modified_config.json`;

          await orchestrator.exec(`${env.pla.toolsAddress}`, command, []);

          //########################## Adjusted
          logger.info("###########################################");
          const anchorHost = `${env.orgName}-${DeploymentStage.PEER}-0`;
          const anchorPort = env.peer0.port;

          command =
            `jq --arg org "${org}" --arg host "${anchorHost}" --argjson port ${anchorPort} ` +
            `".channel_group.groups.Application.groups[\\$org].values.AnchorPeers = {` +
            `  \\"mod_policy\\":\\"Admins\\",` +
            `  \\"value\\":{ \\"anchor_peers\\":[ { \\"host\\":\\$host, \\"port\\":\\$port } ] },` +
            `  \\"version\\":\\"0\\"` +
            `}" ` +
            `/tmp/temp/modified_config.json > /tmp/temp/modified_config_with_anchor.json`;

          logger.info(command);

          await orchestrator.exec(`${env.pla.toolsAddress}`, command, []);

          logger.info("###########################################");

          configtxlatorBuilder = new ConfigtxlatorCommandBuilder();

          command = configtxlatorBuilder
            .setCommand(ConfigtxlatorCommand.PROTO_ENCODE)
            .setProtoOptions({
              input: "./tmp/temp/config.json",
              type: ConfigtxlatorProtoMessage.CONFIG,
              output: "./tmp/temp/config.pb",
            })
            .build();

          await orchestrator.executeInContainer(
            `${env.pla.toolsAddress}`,
            command.split(" ")
          );

          configtxlatorBuilder = new ConfigtxlatorCommandBuilder();

          command = configtxlatorBuilder
            .setCommand(ConfigtxlatorCommand.PROTO_ENCODE)
            .setProtoOptions({
              input: "./tmp/temp/modified_config_with_anchor.json",
              type: ConfigtxlatorProtoMessage.CONFIG,
              output: "./tmp/temp/modified_config.pb",
            })
            .build();

          await orchestrator.executeInContainer(
            `${env.pla.toolsAddress}`,
            command.split(" ")
          );

          configtxlatorBuilder = new ConfigtxlatorCommandBuilder();

          command = configtxlatorBuilder
            .setCommand(ConfigtxlatorCommand.COMPUTE_UPDATE)
            .setComputeUpdateOptions({
              channelId: env.channel.name,
              original: "./tmp/temp/config.pb",
              updated: "./tmp/temp/modified_config.pb",
              output: "./tmp/temp/org_update.pb",
            })
            .build();

          await orchestrator.executeInContainer(
            `${env.pla.toolsAddress}`,
            command.split(" ")
          );

          configtxlatorBuilder = new ConfigtxlatorCommandBuilder();
          command = configtxlatorBuilder
            .setCommand(ConfigtxlatorCommand.PROTO_DECODE)
            .setProtoOptions({
              input: "./tmp/temp/org_update.pb",
              type: ConfigtxlatorProtoMessage.CONFIG_UPDATE,
              output: "./tmp/temp/org_update.json",
            })
            .build();

          await orchestrator.executeInContainer(
            `${env.pla.toolsAddress}`,
            command.split(" ")
          );

          command =
            `jq -n --arg channel_id "${env.channel.name}" --slurpfile cfg ./tmp/temp/org_update.json ` +
            // eslint-disable-next-line no-useless-escape
            `"{\\\"payload\\\":{\\\"header\\\":{\\\"channel_header\\\":{\\\"channel_id\\\":\\$channel_id,\\\"type\\\":2}},\\\"data\\\":{\\\"config_update\\\":\\$cfg[0]}}}" ` +
            `> ./tmp/temp/org_update_in_envelope.json`;

          await orchestrator.exec(`${env.pla.toolsAddress}`, command, []);

          configtxlatorBuilder = new ConfigtxlatorCommandBuilder();

          command = configtxlatorBuilder
            .setCommand(ConfigtxlatorCommand.PROTO_ENCODE)
            .setProtoOptions({
              input: "./tmp/temp/org_update_in_envelope.json",
              type: ConfigtxlatorProtoMessage.ENVELOPE,
              output: "./tmp/temp/org_update_in_envelope.pb",
            })
            .build();

          await orchestrator.executeInContainer(
            `${env.pla.toolsAddress}`,
            command.split(" ")
          );

          peerChannelBuilder = new FabricPeerChannelCommandBuilder();

          command = peerChannelBuilder
            .setCommand(PeerChannelCommands.UPDATE)
            .setFile(`./tmp/temp/org_update_in_envelope.pb`)
            .setChannelID(env.channel.name)
            .setOrderer(`${env.pla.ordererAddress}:${env.pla.ordererPort}`)
            .enableTLS(true)
            .setTLSCAFile(
              `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${env.pla.orgName}-tls-${env.pla.tlsPort}.pem`
            )
            .build();

          logger.info(`Running command: ${command}`);

          await orchestrator.exec(`${env.pla.peerAddress}`, command, [
            `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
          ]);

          command = `rm -rf /tmp/temp`;
          await orchestrator.exec(`${env.pla.toolsAddress}`, command, []);
        } catch (e: unknown) {
          err = e;
          logger.error(
            `Failed to join organization to the channel ${env.channel.name}.`,
            e as Error
          );
          expect(e).toBeUndefined();
          return;
        }
      });

      it("Joins Peer to the channel", async () => {
        try {
          const containerName = `${env.orgName}-peer-0`;

          let builder = new FabricPeerChannelCommandBuilder();

          let command = builder
            .enableTLS(true)
            .setCommand(PeerChannelCommands.FETCH)
            .setBlockReference("0")
            .setDestination("/etc/hyperledger/fabric/genesis_block.pb")
            .setOrderer(`${env.pla.ordererAddress}:${env.pla.ordererPort}`)
            .setChannelID(env.channel.name)
            .setTLSCAFile(`/etc/hyperledger/fabric/orderer-tls.pem`)
            .build(); //+ ` --ordererTLSHostnameOverride ${orgName}-${ord.name}`;

          logger.info(`Running command: ${command}`);

          await orchestrator.executeInContainer(
            containerName,
            command.split(" ")
          );

          builder = new FabricPeerChannelCommandBuilder();

          command = builder
            .setCommand(PeerChannelCommands.JOIN)
            .setBlockPath("/etc/hyperledger/fabric/genesis_block.pb")
            .setTLSCAFile(`/etc/hyperledger/fabric/orderer-tls.pem`)
            .build();

          logger.info(`Running command: ${command}`);

          await orchestrator.exec(containerName, command, [
            `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
          ]);

          //           await orchestrator.exec(
          //   `${env.pla.peerAddress}`,
          //   "mkdir -p ./tmp/temp",
          //   []
          // );
        } catch (e: unknown) {
          expect(e).toBeUndefined();
          return;
        }
      });
    });
    describe("Stop Idle Containers", () => {
      it("Stops org tools service", async () => {
        try {
          // Resolve container name
          const containerName = `${env.orgName}-${DeploymentStage.TOOLS}`;
          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is stopped.`);
            return;
          }
          const tools = env.tools;
          logger.info(`Shutdown container ${containerName}.`);
          const environment = Object.assign({}, process.env, baseEnv, {
            IMAGE: tools.image,
          });
          await orchestrator.serviceStop(
            env.orgName,
            DeploymentStage.TOOLS,
            dockerComposePath,
            { env: environment }
          );
        } catch (e: unknown) {
          err = e;
          logger.error(`Failed to shutdown Tools.`, e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });

      it("Stops pla tools service", async () => {
        try {
          // Resolve container name
          const containerName = `${env.pla.toolsAddress}`;
          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is stopped.`);
            return;
          }
          const tools = env.tools;
          logger.info(`Shutdown container ${containerName}.`);
          const environment = Object.assign({}, process.env, baseEnv, {
            IMAGE: tools.image,
          });
          await orchestrator.serviceStop(
            env.pla.orgName,
            DeploymentStage.TOOLS,
            dockerComposePath,
            { env: environment }
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



  describe("Deploy Contract", () => {
    let peerInstalledContract = false;
    let sequence = 1;
    let oldContracts: string[] = [];
    let currentId: string = "";

    it("Starts Tools service", async () => {
      try {
        // Resolve container name
        const containerName = `${env.orgName}-${DeploymentStage.TOOLS}`;

        if (await orchestrator.isContainerRunning(containerName)) {
          logger.info(`${containerName} is running.`);
          return;
        }

        const tools = env.tools;

        logger.info(`Start container ${containerName}.`);

        const environment = Object.assign({}, process.env, baseEnv, {
          IMAGE: tools.image,
        });

        await orchestrator.serviceStart(
          env.orgName,
          DeploymentStage.TOOLS,
          dockerComposePath,
          { env: environment }
        );

        await orchestrator.awaitContainerReadiness(containerName);
      } catch (e: unknown) {
        err = e;
        logger.error(`Failed to start Tools.`, e as Error);
        expect(e).toBeUndefined();
        return;
      }
    });

    it("Starts pharmaledger Tools service", async () => {
      try {
        // Resolve container name
        const containerName = `${env.pla.toolsAddress}`;

        if (await orchestrator.isContainerRunning(containerName)) {
          logger.info(`${containerName} is running.`);
          return;
        }

        const tools = env.tools;

        logger.info(`Start container ${containerName}.`);

        const environment = Object.assign({}, process.env, baseEnv, {
          ORG_NAME: env.pla.orgName,
          IMAGE: tools.image,
        });

        await orchestrator.serviceStart(
          env.pla.orgName,
          DeploymentStage.TOOLS,
          dockerComposePath,
          { env: environment }
        );

        await orchestrator.awaitContainerReadiness(containerName);
      } catch (e: unknown) {
        err = e;
        logger.error(`Failed to start Tools.`, e as Error);
        expect(e).toBeUndefined();
        return;
      }
    });

    it("Shutdown old Contract CaaS Service", async () => {
      try {
        // Resolve container name
        const containerName = `${env.orgName}-${DeploymentStage.CCAAS}-${env.contract.name}`;

        if (!(await orchestrator.isContainerRunning(containerName))) {
          logger.info(`${containerName} is already shutdown.`);
          return;
        }

        const chaincode = env.contract;

        // Prepare environment
        const environment = Object.assign({}, process.env, baseEnv, {
          PACKAGE_ID: "",
          CONTRACT_NAME: chaincode.name,
          PORT: chaincode.port,
          IMAGE: chaincode.image,
        });

        await orchestrator.serviceDown(
          env.orgName,
          `${DeploymentStage.CCAAS}`,
          dockerComposePath,
          { env: environment }
        );
      } catch (e: unknown) {
        err = e;
        logger.error("Failed to shutdown contract container", e as Error);
        expect(e).toBeUndefined();
        return;
      }
    });

    it("Queries Contract Sequence", async () => {
      try {
        // Resolve container name
        const containerName = `${env.pla.peerAddress}`;

        if (!(await orchestrator.isContainerRunning(containerName))) {
          logger.info(`${containerName} is not running.`);
          return;
        }

        const builder = new FabricPeerLifecycleChaincodeCommandBuilder();
        const command = builder
          .setCommand(PeerLifecycleChaincodeCommands.QUERYCOMMITTED)
          .setChannelID(env.channel.name)
          .setContractName(env.contract.name)
          .build();

        const output = await orchestrator.exec(containerName, command, [
          `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
        ]);

        const match = output.toString().match(/Sequence:\s*(\d+)/);
        const seq = match ? Number(match[1]) : 0;

        sequence = seq;
      } catch (e: unknown) {
        err = e;
        logger.error("Failed to query contract sequence", e as Error);
        expect(e).toBeUndefined();
        return;
      }
    });

    it("Creates Instalation Package", async () => {
      try {
        // Resolve container name
        const containerName = `${env.orgName}-${DeploymentStage.TOOLS}`;
        const peerContainer = `${env.orgName}-${DeploymentStage.PEER}-0`;

        if (!(await orchestrator.isContainerRunning(containerName))) {
          logger.info(`${containerName} is not running running.`);
          return;
        }

        const builder = new FabricPeerLifecycleChaincodeCommandBuilder();

        let command = builder
          .setCommand(PeerLifecycleChaincodeCommands.QUERYINSTALLED)
          .build();

        const contractList = await orchestrator.exec(peerContainer, command, [
          `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
        ]);

        peerInstalledContract = contractList
          .toString()
          .split("\n")
          .some((line: string) => line.includes(env.contract.name));

        if (env.contract.update) peerInstalledContract = false;

        if (peerInstalledContract) {
          logger.info("Exiting");
          return;
        }

        const chaincode = env.contract;

        const basePath = path.join(
          __dirname,
          STORAGE_DIR_NAME,
          env.orgName,
          `contracts/${env.contract.name}`
        );

        const certPath = path.join(basePath, "tls-cert.pem");

        fs.mkdirSync(basePath, {
          recursive: true,
        });

        const containerPath = `/weaver/contract/${env.contract.name}`;

        command = `rm -rf ${containerPath}`;

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
          "/weaver/shared/tls-cert.pem",
          certPath,
          "from"
        );

        const connection = {
          address: `${env.orgName}-ccaas-${chaincode.name}:${chaincode.port}`,
          dial_timeout: "10s",
          tls_required: true,
          client_auth_required: false,
          root_cert: fs.readFileSync(path.join(certPath)).toString(),
        };

        fs.writeFileSync(
          path.join(basePath, "connection.json"),
          JSON.stringify(connection, null, 2)
        );

        fs.mkdirSync(path.join(basePath, "metadata"), {
          recursive: true,
        });

        //Copy META-INF

        await orchestrator.copyToAndFromContainer(
          `${env.pla.toolsAddress}`,
          `./weaver/contract/${env.contract.name}/META-INF`,
          basePath,
          "from"
        );

        // fs.cpSync(
        //   path.join(basePath, "META-INF"),
        //   path.join(basePath, "metadata/META-INF"),
        //   {
        //     recursive: true,
        //     force: true,
        //     errorOnExist: false,
        //   }
        // );

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

        command = `mkdir -p /weaver/contract/${env.contract.name}`;

        await orchestrator.exec(containerName, command, []);

        await orchestrator.copyToAndFromContainer(
          containerName,
          path.join(basePath, `${chaincode.name}_ccaas.tar.gz`),
          `/weaver/contract/${env.contract.name}/${chaincode.name}_ccaas.tar.gz`
        );

        await orchestrator.copyToAndFromContainer(
          containerName,
          path.join(basePath, "META-INF"),
          `/weaver/contract/${env.contract.name}/META-INF`
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

    it("Caches previous installed", async () => {
      try {
        // Resolve container name
        const containerName = `${env.orgName}-${DeploymentStage.PEER}-0`;

        if (!(await orchestrator.isContainerRunning(containerName))) {
          logger.info(`${containerName} is not running running.`);
          return;
        }

        const builder = new FabricPeerLifecycleChaincodeCommandBuilder();
        const command = builder
          .setCommand(PeerLifecycleChaincodeCommands.QUERYINSTALLED)
          .build();
        logger.info(`Running command: ${command}`);

        const res = await orchestrator.exec(containerName, command, [
          `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
        ]);

        oldContracts = res
          .toString()
          .split("\n")
          .slice(1)
          .map((id: string) =>
            id
              .split(",")[0]
              .split(":")
              .slice(1)
              .map((s: string) => s.trim())
              .join(":")
          );
      } catch (e: unknown) {
        err = e;
        logger.error(
          "Failed to cache installed packages contract package",
          e as Error
        );
        expect(e).toBeUndefined();
        return;
      }
    });

    it("Installs contract on peers", async () => {
      try {
        // Resolve container name
        const containerName = `${env.orgName}-${DeploymentStage.TOOLS}`;

        if (!(await orchestrator.isContainerRunning(containerName))) {
          logger.info(`${containerName} is not running running.`);
          return;
        }

        if (peerInstalledContract) {
          logger.info("Exiting");
          return;
        }

        const chaincode = env.contract;

        const peerContainer = `${env.orgName}-${DeploymentStage.PEER}-0`;
        const builder = new FabricPeerLifecycleChaincodeCommandBuilder();

        const command = builder
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

    it("Start Contract CaaS Service", async () => {
      try {
        // Resolve container name
        const containerName = `${env.orgName}-${DeploymentStage.CCAAS}-${env.contract.name}`;

        if (await orchestrator.isContainerRunning(containerName)) {
          logger.info(`${containerName} is already running running.`);
          return;
        }

        const chaincode = env.contract;

        const container = `${env.orgName}-${DeploymentStage.PEER}-0`;

        const builder = new FabricPeerLifecycleChaincodeCommandBuilder();
        const command = builder
          .setCommand(PeerLifecycleChaincodeCommands.QUERYINSTALLED)
          .build();
        logger.info(`Running command: ${command}`);

        const res = await orchestrator.exec(container, command, [
          `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
        ]);

        const currentInstallations = res
          .toString()
          .split("\n")
          .slice(1)
          .map((id: string) =>
            id
              .split(",")[0]
              .split(":")
              .slice(1)
              .map((s: string) => s.trim())
              .join(":")
          );

        currentId =
          currentInstallations.filter(
            (c: string) => !oldContracts.includes(c)
          )[0] || "";

        if (!currentId) throw new Error("Unable to extract currentId");

        const packageID = currentId;

        // Prepare environment
        const environment = Object.assign({}, process.env, baseEnv, {
          PACKAGE_ID: packageID,
          CONTRACT_NAME: chaincode.name,
          PORT: chaincode.port,
          IMAGE: chaincode.image,
          PLA_ORG_NAME: env.pla.orgName,
          CHAINCODE_MAXRECVMSGSIZE: chaincode.maxRecvMsgSize,
          CHAINCODE_MAXSENDMSGSIZE: chaincode.maxSendMsgSize,
          // CORE_PEER_LOCALMSPID: generateMspId(env.orgName.toLowerCase()),
        });

        await orchestrator.serviceUp(
          env.orgName,
          `${DeploymentStage.CCAAS}`,
          dockerComposePath,
          { env: environment }
        );
      } catch (e: unknown) {
        err = e;
        logger.error("Failed to boot contract container", e as Error);
        expect(e).toBeUndefined();
        return;
      }
    });

    it("Approves Contract", async () => {
      try {
        // Resolve container name
        const containerName = `${env.orgName}-${DeploymentStage.PEER}-0`;

        if (!(await orchestrator.isContainerRunning(containerName))) {
          logger.info(`${containerName} is not running running.`);
          return;
        }

        //TODO: Find some exit condition

        const id = currentId;

        const builder = new FabricPeerLifecycleChaincodeCommandBuilder();

        const command = builder
          .setCommand(PeerLifecycleChaincodeCommands.APPROVEFORMYORG)
          .setChannelID(env.channel.name)
          .setOrdererAddress(`${env.pla.ordererAddress}:${env.pla.ordererPort}`)
          .setPackageID(id)
          .setVersion(env.contract.version.toString() || "1.0")
          .setSequence(sequence.toString())
          .enableTLS(true)
          .setTLSCAFile(`/etc/hyperledger/fabric/orderer-tls.pem`)
          .setContractName(env.contract.name)
          .setCollectionsConfigPath(
            env.enableCollections
              ? `/etc/hyperledger/contract/${env.contract.name}/META-INF/collections_config.json`
              : undefined
          )
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

    it("Stop Tools service", async () => {
      try {
        // Resolve container name
        const containerName = `${env.orgName}-${DeploymentStage.TOOLS}`;

        if (!(await orchestrator.isContainerRunning(containerName))) {
          logger.info(`${containerName} is running.`);
          return;
        }

        const tools = env.tools;

        logger.info(`Shutdown container ${containerName}.`);

        const environment = Object.assign({}, process.env, baseEnv, {
          IMAGE: tools.image,
        });

        await orchestrator.serviceStop(
          env.orgName,
          DeploymentStage.TOOLS,
          dockerComposePath,
          { env: environment }
        );
      } catch (e: unknown) {
        err = e;
        logger.error(`Failed to shutdown Tools.`, e as Error);
        expect(e).toBeUndefined();
        return;
      }
    });

    it("Stop Pharmaledger Tools service", async () => {
      try {
        // Resolve container name
        const containerName = `${env.pla.toolsAddress}`;

        if (!(await orchestrator.isContainerRunning(containerName))) {
          logger.info(`${containerName} is running.`);
          return;
        }

        const tools = env.tools;

        logger.info(`Shutdown container ${containerName}.`);

        const environment = Object.assign({}, process.env, baseEnv, {
          IMAGE: tools.image,
        });

        await orchestrator.serviceStop(
          env.pla.orgName,
          DeploymentStage.TOOLS,
          dockerComposePath,
          { env: environment }
        );
      } catch (e: unknown) {
        err = e;
        logger.error(`Failed to shutdown Tools.`, e as Error);
        expect(e).toBeUndefined();
        return;
      }
    });

    // it("Restart Couch DBs Service", async () => {
    //   try {
    //     const peer0 = env.peer0;

    //     const environment = Object.assign({}, process.env, baseEnv, {
    //       consCOUCHDB_IMAGE: peer0.couchdbImage,
    //       COUCHDB_USER: peer0.couchdbUser,
    //       COUCHDB_SECRET: peer0.couchdbSecret,
    //       ORG_NAME: env.orgName,
    //       COUCHDB_PORT: peer0.couchdbPort,
    //     });

    //     await orchestrator.serviceRestart(
    //       env.orgName,
    //       `${DeploymentStage.PEER}-0-${DeploymentStage.COUCHDB}`,
    //       dockerComposePath,
    //       { env: environment }
    //     );
    //   } catch (e: unknown) {
    //     err = e;
    //     logger.error("Failed to shutdown contract container", e as Error);
    //     expect(e).toBeUndefined();
    //     return;
    //   }
    // });
  });

  describe("Update Image Contract", () => {
    let currentId: string = "";

    it("Starts Tools service", async () => {
      try {
        // Resolve container name
        const containerName = `${env.orgName}-${DeploymentStage.TOOLS}`;

        if (await orchestrator.isContainerRunning(containerName)) {
          logger.info(`${containerName} is running.`);
          return;
        }

        const tools = env.tools;

        logger.info(`Start container ${containerName}.`);

        const environment = Object.assign({}, process.env, baseEnv, {
          IMAGE: tools.image,
        });

        await orchestrator.serviceStart(
          env.orgName,
          DeploymentStage.TOOLS,
          dockerComposePath,
          { env: environment }
        );

        await orchestrator.awaitContainerReadiness(containerName);
      } catch (e: unknown) {
        err = e;
        logger.error(`Failed to start Tools.`, e as Error);
        expect(e).toBeUndefined();
        return;
      }
    });

    it("Shutdown old Contract CaaS Service", async () => {
      try {
        // Resolve container name
        const containerName = `${env.orgName}-${DeploymentStage.CCAAS}-${env.contract.name}`;

        if (!(await orchestrator.isContainerRunning(containerName))) {
          logger.info(`${containerName} is already shutdown.`);
          return;
        }

        const res = await orchestrator.getEnv(containerName, "env", [
          `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
        ]);

        console.log("ENV RES", res.toString());

        res
          .toString()
          .split("\n")
          .forEach((line: string) => {
            if (line.startsWith("CHAINCODE_ID=")) {
              currentId = line.split("=")[1].trim();
            }
          });

        const chaincode = env.contract;

        // Prepare environment
        const environment = Object.assign({}, process.env, baseEnv, {
          PACKAGE_ID: "",
          CONTRACT_NAME: chaincode.name,
          PORT: chaincode.port,
          IMAGE: chaincode.image,
        });

        await orchestrator.serviceDown(
          env.orgName,
          `${DeploymentStage.CCAAS}`,
          dockerComposePath,
          { env: environment }
        );
      } catch (e: unknown) {
        err = e;
        logger.error("Failed to shutdown contract container", e as Error);
        expect(e).toBeUndefined();
        return;
      }
    });

    it("Start Contract CaaS Service", async () => {
      try {
        // Resolve container name
        const containerName = `${env.orgName}-${DeploymentStage.CCAAS}-${env.contract.name}`;

        if (await orchestrator.isContainerRunning(containerName)) {
          logger.info(`${containerName} is already running running.`);
          return;
        }

        const chaincode = env.contract;

        if (!currentId) throw new Error("Unable to extract currentId");

        const packageID = currentId;

        // Prepare environment
        const environment = Object.assign({}, process.env, baseEnv, {
          PACKAGE_ID: packageID,
          CONTRACT_NAME: chaincode.name,
          PORT: chaincode.port,
          IMAGE: chaincode.image,
          PLA_ORG_NAME: env.pla.orgName,
          CHAINCODE_MAXRECVMSGSIZE: chaincode.maxRecvMsgSize,
          CHAINCODE_MAXSENDMSGSIZE: chaincode.maxSendMsgSize,
          // CORE_PEER_LOCALMSPID: generateMspId(env.orgName.toLowerCase()),
        });

        await orchestrator.serviceUp(
          env.orgName,
          `${DeploymentStage.CCAAS}`,
          dockerComposePath,
          { env: environment }
        );
      } catch (e: unknown) {
        err = e;
        logger.error("Failed to boot contract container", e as Error);
        expect(e).toBeUndefined();
        return;
      }
    });

    it("Stop Tools service", async () => {
      try {
        // Resolve container name
        const containerName = `${env.orgName}-${DeploymentStage.TOOLS}`;

        if (!(await orchestrator.isContainerRunning(containerName))) {
          logger.info(`${containerName} is running.`);
          return;
        }

        const tools = env.tools;

        logger.info(`Shutdown container ${containerName}.`);

        const environment = Object.assign({}, process.env, baseEnv, {
          IMAGE: tools.image,
        });

        await orchestrator.serviceStop(
          env.orgName,
          DeploymentStage.TOOLS,
          dockerComposePath,
          { env: environment }
        );
      } catch (e: unknown) {
        err = e;
        logger.error(`Failed to shutdown Tools.`, e as Error);
        expect(e).toBeUndefined();
        return;
      }
    });
  });

  describe("Shutdown Infrastructure", () => {
    describe("Shutdown Contract containers", () => {
      it("Shutdown Contract CaaS Service", async () => {
        try {
          // Resolve container name
          const containerName = `${env.orgName}-${DeploymentStage.CCAAS}-${env.contract.name}`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is already running running.`);
            return;
          }

          const chaincode = env.contract;

          // Prepare environment
          const environment = Object.assign({}, process.env, baseEnv, {
            PACKAGE_ID: "",
            CONTRACT_NAME: chaincode.name,
            PORT: chaincode.port,
            IMAGE: chaincode.image,
          });

          await orchestrator.serviceDown(
            env.orgName,
            `${DeploymentStage.CCAAS}`,
            dockerComposePath,
            { env: environment }
          );
        } catch (e: unknown) {
          err = e;
          logger.error("Failed to boot contract container", e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
      it("Shutdown Contract CaaS on prem Service", async () => {
        try {
          // Resolve container name
          const containerName = `${env.orgName}-${DeploymentStage.CCAAS}-${env.onPremContract.name}`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is already stopped.`);
            return;
          }

          const chaincode = env.onPremContract;

          // Prepare environment
          const containerEnv = Object.assign({}, process.env, baseEnv, {
            PACKAGE_ID: "",
            CONTRACT_NAME: chaincode.name,
            PORT: chaincode.port,
            IMAGE: chaincode.image,
          });

          await orchestrator.serviceDown(
            env.orgName,
            `${DeploymentStage.CCAAS}-${DeploymentStage.ON_PREM}`,
            dockerComposePath,
            { env: containerEnv }
          );
        } catch (e: unknown) {
          err = e;
          logger.error("Failed to stop contract container", e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
    });

    describe("Shutdown Peer containers", () => {
      describe("Peer-0", () => {
        it("Shutdown Service", async () => {
          try {
            // Resolve container name
            const containerName = `${env.orgName}-${DeploymentStage.PEER}-0`;

            //Check if container is already running. Skipping if already running...
            if (!(await orchestrator.isContainerRunning(containerName))) {
              logger.info(
                `Container: ${containerName} already running. Skipping deployment...`
              );
              return;
            }

            logger.info(`Starting ${env.orgName} Peer as ${containerName}`);

            const environment = Object.assign({}, process.env, baseEnv, {
              IMAGE: env.peer0.image,
              OPERATIONS_ADDRESS: env.peer0.operationsAddress,
              PORT: env.peer0.port,
            });

            // Start Orderer service
            await orchestrator.serviceDown(
              env.orgName,
              `${DeploymentStage.PEER}-0`,
              dockerComposePath,
              { env: environment }
            );

            logger.info(`Booting ${env.orgName} CA as ${containerName}`);

            logger.info(`Peer Deployed Successfully.`);
          } catch (e: unknown) {
            err = e;
            expect(e).toBeUndefined();
            return;
          }
        });
        it("Shutdown DB Service", async () => {
          try {
            // Resolve container name
            const containerName = `${env.orgName}-${DeploymentStage.PEER}-0-${DeploymentStage.COUCHDB}`;

            //Check if container is already running. Skipping if already running...
            if (!(await orchestrator.isContainerRunning(containerName))) {
              logger.info(
                `Container: ${containerName} not running. Skipping shutdown...`
              );
              return;
            }

            logger.info(
              `Starting ${env.orgName} peer couchdb as ${containerName}`
            );

            const environment = Object.assign({}, process.env, baseEnv, {
              COUCHDB_IMAGE: env.peer0.couchdbImage,
              COUCHDB_USER: env.peer0.couchdbUser,
              COUCHDB_SECRET: env.peer0.couchdbSecret,
              ORG_NAME: env.orgName,
              COUCHDB_PORT: env.peer0.couchdbPort,
            });

            // Start Orderer service
            await orchestrator.serviceDown(
              env.orgName,
              `${DeploymentStage.PEER}-0-${DeploymentStage.COUCHDB}`,
              dockerComposePath,
              { env: environment }
            );

            logger.info(
              `Shutting down ${env.orgName} CouchDB for peer as ${containerName}`
            );

            logger.info(`Peer CouchDB shutdown Successfully.`);
          } catch (e: unknown) {
            err = e;
            expect(e).toBeUndefined();
            return;
          }
        });
      });
    });

    describe("Shutdown CA Container", () => {
      it("Stops Service", async () => {
        try {
          // Resolve container name
          const containerName = `${env.orgName}-${DeploymentStage.CA}`;
          //If the tools container is not up no point in doing shutdown again
          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`The ca container has already been shut down.`);
            return;
          }

          logger.info(`Shutting down ${containerName}`);

          const environment = Object.assign({}, process.env, baseEnv, {
            IMAGE: env.ca.image,
            OPERATIONS_ADDRESS: env.ca.operationsAddress,
          });

          await orchestrator.serviceDown(
            env.orgName,
            DeploymentStage.CA,
            dockerComposePath,
            { env: environment }
          );

          logger.info(`${containerName} was successfully shut down`);
        } catch (e: unknown) {
          err = e;
          logger.error("Error shutting down CA", e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
    });

    describe("Shutdown TLS CA Container", () => {
      it("Stops Service", async () => {
        try {
          // Resolve container name
          const containerName = `${env.orgName}-${DeploymentStage.TLS}`;
          //If the tools container is not up no point in doing shutdown again
          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`The tls container has already been shut down.`);
            return;
          }

          logger.info(`Shutting down ${containerName}`);

          const environment = Object.assign({}, process.env, baseEnv, {
            IMAGE: env.tls.image,
            ORDERER_ADDRESS: env.tls.operationsAddress,
          });

          await orchestrator.serviceDown(
            env.orgName,
            DeploymentStage.TLS,
            dockerComposePath,
            { env: environment }
          );

          logger.info(`${containerName} was successfully shut down`);
        } catch (e: unknown) {
          err = e;
          logger.error("Error TLS CA", e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
    });

    describe("Shutdown Tools Container", () => {
      it("Stops Service", async () => {
        try {
          // Resolve container name
          const containerName = `${env.orgName}-${DeploymentStage.TOOLS}`;
          //If the tools container is not up no point in doing shutdown again
          if (!(await orchestrator.containerExists(containerName))) {
            logger.info(`The Tools container has already been shut down.`);
            return;
          }

          logger.info(`Shutting down ${containerName}`);

          const environment = Object.assign({}, process.env, baseEnv, {
            IMAGE: env.tools.image,
          });

          await orchestrator.serviceDown(
            env.orgName,
            DeploymentStage.TOOLS,
            dockerComposePath,
            { env: environment }
          );

          logger.info(`${containerName} was successfully shut down`);
        } catch (e: unknown) {
          err = e;
          logger.error("Error booting External CA", e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });
    });

    describe("Clean Up", () => {
      it("Removes local folders", async () => {
        try {
          const dir = path.join(__dirname, "tmp");

          if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
          }

          logger.info(`Clean Up completed Successfully.`);
        } catch (e: unknown) {
          expect(e).toBeUndefined();
          return;
        }
      });
    });
  });
});
