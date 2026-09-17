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
  ConfigtxlatorCommand,
  ConfigtxlatorCommandBuilder,
  ConfigtxlatorProtoMessage,
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

type AnchorPeer = {
  host: string;
  port: number;
};

type FabricOrg = {
  values?: {
    AnchorPeers?: {
      value?: {
        anchor_peers?: AnchorPeer[];
      };
    };
  };
};

const InfrastructureEnvironment: InfrastructureConfig =
  LoggedEnvironment.accumulate(DefaultInfrastructureConfig);

const logger: Logger = Logging.for("Boot Infrastructure");

const orchestrator: DeploymentOrchestrator =
  OrchestratorFactory.getOrchestrator();

describe("Deploy Pharmaledger Infrastructure", () => {
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

    // orchestrator.runFunction = (
    //   command: string,
    //   config: { [indexer: string]: any }
    // ) => {
    //   return runAndReport(command, config, StandardOutputWriter, reporter)
    //     .promise;
    // };
  });

  afterAll(() => {
    logger.info(
      "RUN COMMAND: sudo chown -R $USER:$USER ./tests/infrastructure/storage"
    );
  });

  describe("Boot Infrastructure", () => {
    describe("SIMPLE-XXX - Boot Infrastructure", () => {
      describe("Tools Container", () => {
        it("STEP-1 Starts Service", async () => {
          try {
            // Resolve container name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

            if (await orchestrator.isContainerRunning(containerName)) {
              logger.info(
                `${containerName} is already running. Deployment skipped.`
              );
              return;
            }

            const tools = InfrastructureEnvironment.tools;

            logger.info(`Starting container ${containerName}.`);

            const env = Object.assign({}, process.env, baseEnv, {
              IMAGE: tools.image,
            });

            await orchestrator.serviceUp(
              InfrastructureEnvironment.orgName,
              DeploymentStage.TOOLS,
              dockerComposePath,
              { env }
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
        it("STEP-2 Boot External CA", async () => {
          try {
            // Resolve container name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TLS}`;

            if (await orchestrator.containerExists(containerName)) {
              logger.info(
                `TLS CA is already deployed. Skipping certificate generation.`
              );
              return;
            }

            logger.info(`Generating certificates using external CA.`);

            await orchestrator.executeCommand(
              `${path.join(__dirname, "../create-pki.sh")} ./infrastructure`
            );

            logger.info(`Certificates generated successfully.`);
          } catch (e: unknown) {
            err = e;
            logger.error(`Failed to boot external CA.`, e as Error);
            expect(e).toBeUndefined();
            return;
          }
        });

        it("STEP-3 Populates TLS Volume with certificates", async () => {
          try {
            // Resolve container name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TLS}`;

            if (await orchestrator.isContainerRunning(containerName)) {
              logger.info(
                `TLS container is already running. Skipping TLS volume population.`
              );
              return;
            }

            const toolsContainer = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

            const origin = path.join(
              __dirname,
              STORAGE_DIR_NAME,
              InfrastructureEnvironment.orgName,
              DeploymentStage.TLS
            );

            logger.info(
              `Populating TLS CA volume with generated certificates.`
            );

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

        it("STEP-4 Populates CA Volume with certificates", async () => {
          try {
            // Resolve container name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;

            if (await orchestrator.isContainerRunning(containerName)) {
              logger.info(
                `CA container is already running. Skipping CA volume population.`
              );
              return;
            }

            const toolsContainer = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

            const origin = path.join(
              __dirname,
              STORAGE_DIR_NAME,
              InfrastructureEnvironment.orgName,
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
        it("STEP-5 Generates TLS CA Config", async () => {
          try {
            // Resolve container name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TLS}`;

            if (await orchestrator.isContainerRunning(containerName)) {
              logger.info(
                `TLS CA container is already running. Skipping configuration generation.`
              );
              return;
            }

            const cn = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TLS}`;
            const tls = InfrastructureEnvironment.tls;
            const org = InfrastructureEnvironment.org;

            logger.info(
              `Generating TLS CA configuration for organization ${InfrastructureEnvironment.orgName}.`
            );

            const dest = path.join(
              __dirname,
              STORAGE_DIR_NAME,
              InfrastructureEnvironment.orgName,
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
              `TLS CA configuration generated successfully for organization ${InfrastructureEnvironment.orgName}.`
            );
          } catch (e: unknown) {
            err = e;
            logger.error(
              `Failed to generate TLS CA configuration.`,
              e as Error
            );
            expect(e).toBeUndefined();
            return;
          }
        });

        it("STEP-6 Populates TLS Volume", async () => {
          try {
            // Resolve container name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TLS}`;

            if (await orchestrator.isContainerRunning(containerName)) {
              logger.info(
                `TLS container is already running. Skipping TLS volume population.`
              );
              return;
            }

            const toolsContainer = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

            const origin = path.join(
              __dirname,
              STORAGE_DIR_NAME,
              InfrastructureEnvironment.orgName,
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

        it("STEP-7 Starts Service", async () => {
          try {
            // Resolve container name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TLS}`;

            if (await orchestrator.isContainerRunning(containerName)) {
              logger.info(
                `TLS CA container is already running. Skipping deployment.`
              );
              return;
            }

            const tls = InfrastructureEnvironment.tls;

            logger.info(
              `Starting TLS CA for organization ${InfrastructureEnvironment.orgName} (container: ${containerName}).`
            );

            const env = Object.assign({}, process.env, baseEnv, {
              IMAGE: tls.image,
              OPERATIONS_ADDRESS: tls.operationsAddress,
              PORT: tls.port,
            });

            await orchestrator.serviceUp(
              InfrastructureEnvironment.orgName,
              DeploymentStage.TLS,
              dockerComposePath,
              { env }
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

        it("STEP-8 Registers and Enrolls Identities", async () => {
          try {
            //Resolve Container Name
            const caContainerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;
            const tlsContainerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TLS}`;

            if (await orchestrator.isContainerRunning(caContainerName)) {
              logger.info(
                `CA container ${caContainerName} is already running. Skipping identity registration and enrollment.`
              );
              return;
            }

            const tls = InfrastructureEnvironment.tls;
            const ca = InfrastructureEnvironment.ca;
            const orderer0 = InfrastructureEnvironment.orderer0;
            const orderer1 = InfrastructureEnvironment.orderer1;
            const orderer2 = InfrastructureEnvironment.orderer2;
            const peer0 = InfrastructureEnvironment.peer0;
            const peer1 = InfrastructureEnvironment.peer1;
            const peer2 = InfrastructureEnvironment.peer2;

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
            // Register Orderers
            logger.info(`Registering orderer identities.`);

            // Register Orderer 0
            builder = new FabricCAClientCommandBuilder();

            command = builder
              .setUrl(`https://${tlsContainerName}:${tls.port}`)
              .setCommand(FabricCAClientCommand.REGISTER)
              .setIdentity({
                name: orderer0.user,
                secret: orderer0.secret,
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

            // Register Orderer 1
            builder = new FabricCAClientCommandBuilder();

            command = builder
              .setUrl(`https://${tlsContainerName}:${tls.port}`)
              .setCommand(FabricCAClientCommand.REGISTER)
              .setIdentity({
                name: orderer1.user,
                secret: orderer1.secret,
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

            // Register Orderer 2
            builder = new FabricCAClientCommandBuilder();

            command = builder
              .setUrl(`https://${tlsContainerName}:${tls.port}`)
              .setCommand(FabricCAClientCommand.REGISTER)
              .setIdentity({
                name: orderer2.user,
                secret: orderer2.secret,
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

            // Register Peer 1
            builder = new FabricCAClientCommandBuilder();

            command = builder
              .setUrl(`https://${tlsContainerName}:${tls.port}`)
              .setCommand(FabricCAClientCommand.REGISTER)
              .setIdentity({
                name: peer1.user,
                secret: peer1.secret,
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

            // Register Peer 2
            builder = new FabricCAClientCommandBuilder();

            command = builder
              .setUrl(`https://${tlsContainerName}:${tls.port}`)
              .setCommand(FabricCAClientCommand.REGISTER)
              .setIdentity({
                name: peer2.user,
                secret: peer2.secret,
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

            logger.info(
              `Identity registration and enrollment completed successfully.`
            );

            builder = new FabricCAClientCommandBuilder();

            command = builder
              .setUrl(`https://${tlsContainerName}:${tls.port}`)
              .setCommand(FabricCAClientCommand.REGISTER)
              .setIdentity({
                name: InfrastructureEnvironment.contract.user,
                secret: InfrastructureEnvironment.contract.secret,
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
          } catch (e: unknown) {
            err = e;
            logger.error("Error handling identities in the TLS CA", e as Error);
            expect(e).toBeUndefined();
            return;
          }
        });
      });

      describe("CA", () => {
        it("STEP-9 Generate CA Server Config", async () => {
          try {
            // Resolve Container Name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;

            if (await orchestrator.isContainerRunning(containerName)) {
              logger.info(
                `CA container ${containerName} is already running. Skipping configuration generation.`
              );
              return;
            }

            const cn = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;
            const ca = InfrastructureEnvironment.ca;
            const org = InfrastructureEnvironment.org;
            const hsm = InfrastructureEnvironment.hsm;

            const dest = path.join(
              __dirname,
              STORAGE_DIR_NAME,
              InfrastructureEnvironment.orgName,
              DeploymentStage.CA,
              "server"
            );

            logger.info(
              `Generating CA server configuration for organization ${InfrastructureEnvironment.orgName}.`
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
              `CA server configuration generated successfully for organization ${InfrastructureEnvironment.orgName}.`
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

        it("STEP-10 Populates CA Volume", async () => {
          try {
            // Resolve container name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;

            if (await orchestrator.isContainerRunning(containerName)) {
              logger.info(
                `CA container ${containerName} is already running. Skipping CA volume population.`
              );
              return;
            }

            const toolsContainer = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

            const origin = path.join(
              __dirname,
              STORAGE_DIR_NAME,
              InfrastructureEnvironment.orgName,
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

        it("STEP-11 Starts Service", async () => {
          try {
            // Resolve container name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;

            //Check if container is already running. Skipping if already running...
            if (await orchestrator.isContainerRunning(containerName)) {
              logger.info(
                `CA container ${containerName} is already running. Skipping startup.`
              );
              return;
            }

            logger.info(
              `Starting CA service for organization ${InfrastructureEnvironment.orgName} (container: ${containerName}).`
            );

            const env = Object.assign({}, process.env, baseEnv, {
              IMAGE: InfrastructureEnvironment.ca.image,
              OPERATIONS_ADDRESS:
                InfrastructureEnvironment.ca.operationsAddress,
              PORT: InfrastructureEnvironment.ca.port,
            });

            // Start CA service
            await orchestrator.serviceUp(
              InfrastructureEnvironment.orgName,
              DeploymentStage.CA,
              dockerComposePath,
              { env }
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

        it("STEP-12 Registers/Enrolls CA Identities", async () => {
          try {
            const peerName = `${DeploymentStage.PEER}-0`;

            //Resolve Container Name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;
            const peerContainerName = `${InfrastructureEnvironment.orgName}-${peerName}`;

            if (await orchestrator.isContainerRunning(peerContainerName)) {
              logger.info(
                `Peer-0 container ${peerContainerName} is already running. Skipping CA identity registration and enrollment.`
              );
              return;
            }

            const ca = InfrastructureEnvironment.ca;
            const tls = InfrastructureEnvironment.tls;

            logger.info(
              `Registering and enrolling CA identities for organization ${InfrastructureEnvironment.orgName} (CA container: ${containerName}).`
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
                `https://${ca.user}:${ca.secret}@${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}:${ca.port}`
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
                `https://${ca.admin}:${ca.adminSecret}@${InfrastructureEnvironment.orgName}-${DeploymentStage.TLS}:${tls.port}`
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
                `https://${ca.admin}:${ca.adminSecret}@${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}:${ca.port}`
              )
              .build();

            logger.info(`Executing: ${command}`);

            await orchestrator.executeInContainer(
              containerName,
              command.split(" ")
            );

            logger.info(
              `CA identity registration and enrollment completed successfully for ${InfrastructureEnvironment.orgName}.`
            );
          } catch (e: unknown) {
            err = e;
            logger.error(
              `Failed to register/enroll CA identities.`,
              e as Error
            );
            expect(e).toBeUndefined();
            return;
          }
        });

        it("STEP-13 Create NodeOU config files for ca identities and populate the volumes", async () => {
          try {
            const peerContainerName = `${InfrastructureEnvironment.orgName}-peer-0`;
            const caContainerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;

            //Check if container is already running. Skipping if already running...
            if (await orchestrator.isContainerRunning(peerContainerName)) {
              logger.info(
                `Peer-0 container ${peerContainerName} is already running. Skipping CA admin NodeOU configuration generation and volume population.`
              );
              return;
            }

            logger.info(
              `Generating CA admin NodeOU configuration for organization ${InfrastructureEnvironment.orgName}.`
            );

            const basePath = path.join(
              __dirname,
              STORAGE_DIR_NAME,
              InfrastructureEnvironment.orgName,
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
                  Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                  OrganizationalUnitIdentifier: FabricAccountType.CLIENT,
                },
                AdminOUIdentifier: {
                  Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                  OrganizationalUnitIdentifier: FabricAccountType.ADMIN,
                },
                PeerOUIdentifier: {
                  Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                  OrganizationalUnitIdentifier: FabricAccountType.PEER,
                },
                OrdererOUIdentifier: {
                  Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
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

        it("STEP-14 Registers/Enrolls Orderers Identities", async () => {
          try {
            const peerName = `${DeploymentStage.PEER}-0`;

            //Resolve Container Name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;
            const peerContainerName = `${InfrastructureEnvironment.orgName}-${peerName}`;

            if (await orchestrator.isContainerRunning(peerContainerName)) {
              logger.info(
                `Peer-0 container ${peerContainerName} is already running. Skipping orderer identity registration and enrollment.`
              );
              return;
            }

            const ca = InfrastructureEnvironment.ca;
            const tls = InfrastructureEnvironment.tls;
            const orderer0 = InfrastructureEnvironment.orderer0;
            const orderer1 = InfrastructureEnvironment.orderer1;
            const orderer2 = InfrastructureEnvironment.orderer2;

            logger.info(
              `Registering and enrolling orderer identities for organization ${InfrastructureEnvironment.orgName} (CA container: ${containerName}).`
            );

            // Orderer 0
            logger.info(`Processing orderer-0 identity (${orderer0.user}).`);

            // Register with CA
            logger.info(`Registering orderer-0 with CA.`);

            let builder = new FabricCAClientCommandBuilder();
            let command = builder
              .setCommand(FabricCAClientCommand.REGISTER)
              .setIdentity({
                name: orderer0.user,
                secret: orderer0.secret,
                type: FabricAccountType.ORDERER,
              })
              .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
              .setMspdir("/etc/hyperledger/client/client/msp")
              .build();

            logger.info(`Executing: ${command}`);

            await orchestrator.executeInContainer(
              containerName,
              command.split(" ")
            );

            // Enroll orderer TLS
            logger.info(`Enrolling orderer-0 TLS identity.`);

            builder = new FabricCAClientCommandBuilder();
            command = builder
              .setCommand(FabricCAClientCommand.ENROLL)
              .setEnrollment({ profile: "tls" })
              .setHome(`/etc/hyperledger/client/orderers/orderer-0/tls`)
              .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
              .setCSR({
                hosts: orderer0.csrHosts!.split(","),
              })
              .setUrl(
                `https://${orderer0.user}:${orderer0.secret}@${InfrastructureEnvironment.orgName}-${DeploymentStage.TLS}:${tls.port}`
              )
              .build();

            logger.info(`Executing: ${command}`);

            await orchestrator.executeInContainer(
              containerName,
              command.split(" ")
            );

            // Enroll orderer CA MSP
            logger.info(`Enrolling orderer-0 CA identity (MSP).`);

            builder = new FabricCAClientCommandBuilder();

            command = builder
              .setCommand(FabricCAClientCommand.ENROLL)
              .setHome(`/etc/hyperledger/client/orderers/orderer-0/ca`)
              .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
              .setCSR({
                hosts: orderer0.csrHosts!.split(","),
              })
              .setUrl(
                `https://${orderer0.user}:${orderer0.secret}@${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}:${ca.port}`
              )
              .build();

            logger.info(`Executing: ${command}`);

            await orchestrator.executeInContainer(
              containerName,
              command.split(" ")
            );

            // Normalize key filename
            logger.info(`Normalizing orderer-0 TLS private key filename.`);

            command = `mv /etc/hyperledger/client/orderers/orderer-0/tls/msp/keystore/* /etc/hyperledger/client/orderers/orderer-0/tls/msp/keystore/key.pem`;
            logger.info(`Executing: ${command}`);

            await orchestrator.exec(containerName, command, []);

            // Orderer 1
            logger.info(`Processing orderer-1 identity.`);

            // Register with CA
            logger.info(`Registering orderer-1 with CA.`);
            logger.info(`Executing: ${command}`);

            builder = new FabricCAClientCommandBuilder();
            command = builder
              .setCommand(FabricCAClientCommand.REGISTER)
              .setIdentity({
                name: orderer1.user,
                secret: orderer1.secret,
                type: FabricAccountType.ORDERER,
              })
              .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
              .setMspdir("/etc/hyperledger/client/client/msp")
              .build();

            logger.info(`Executing: ${command}`);
            await orchestrator.executeInContainer(
              containerName,
              command.split(" ")
            );

            // Enroll orderer TLS
            logger.info(`Enrolling orderer-1 TLS identity.`);

            builder = new FabricCAClientCommandBuilder();
            command = builder
              .setCommand(FabricCAClientCommand.ENROLL)
              .setEnrollment({ profile: "tls" })
              .setHome(`/etc/hyperledger/client/orderers/orderer-1/tls`)
              .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
              .setCSR({
                hosts: orderer1.csrHosts!.split(","),
              })
              .setUrl(
                `https://${orderer1.user}:${orderer1.secret}@${InfrastructureEnvironment.orgName}-${DeploymentStage.TLS}:${tls.port}`
              )
              .build();

            logger.info(`Executing: ${command}`);
            await orchestrator.executeInContainer(
              containerName,
              command.split(" ")
            );

            // Enroll orderer CA MSP
            logger.info(`Enrolling orderer-1 CA identity (MSP).`);

            builder = new FabricCAClientCommandBuilder();
            command = builder
              .setCommand(FabricCAClientCommand.ENROLL)
              .setHome(`/etc/hyperledger/client/orderers/orderer-1/ca`)
              .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
              .setCSR({
                hosts: orderer1.csrHosts?.split(","),
              })
              .setUrl(
                `https://${orderer1.user}:${orderer1.secret}@${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}:${ca.port}`
              )
              .build();

            logger.info(`Executing: ${command}`);
            await orchestrator.executeInContainer(
              containerName,
              command.split(" ")
            );

            logger.info(`Normalizing orderer-1 TLS private key filename.`);
            command = `mv /etc/hyperledger/client/orderers/orderer-1/tls/msp/keystore/* /etc/hyperledger/client/orderers/orderer-1/tls/msp/keystore/key.pem`;

            logger.info(`Executing: ${command}`);
            await orchestrator.exec(containerName, command, []);

            // Orderer 2

            logger.info(`Processing orderer-2 identity.`);

            // Register with CA
            logger.info(`Registering orderer-2 with CA.`);

            builder = new FabricCAClientCommandBuilder();
            command = builder
              .setCommand(FabricCAClientCommand.REGISTER)
              .setIdentity({
                name: orderer2.user,
                secret: orderer2.secret,
                type: FabricAccountType.ORDERER,
              })
              .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
              .setMspdir("/etc/hyperledger/client/client/msp")
              .build();

            logger.info(`Executing: ${command}`);
            await orchestrator.executeInContainer(
              containerName,
              command.split(" ")
            );

            // Enroll orderer TLS
            logger.info(`Enrolling orderer-2 TLS identity.`);

            builder = new FabricCAClientCommandBuilder();
            command = builder
              .setCommand(FabricCAClientCommand.ENROLL)
              .setEnrollment({ profile: "tls" })
              .setHome(`/etc/hyperledger/client/orderers/orderer-2/tls`)
              .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
              .setCSR({
                hosts: orderer2.csrHosts?.split(","),
              })
              .setUrl(
                `https://${orderer2.user}:${orderer2.secret}@${InfrastructureEnvironment.orgName}-${DeploymentStage.TLS}:${tls.port}`
              )
              .build();

            logger.info(`Executing: ${command}`);
            await orchestrator.executeInContainer(
              containerName,
              command.split(" ")
            );

            // Enroll orderer CA MSP
            logger.info(`Enrolling orderer-2 CA identity (MSP).`);

            builder = new FabricCAClientCommandBuilder();
            command = builder
              .setCommand(FabricCAClientCommand.ENROLL)
              .setHome(`/etc/hyperledger/client/orderers/orderer-2/ca`)
              .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
              .setCSR({
                hosts: orderer2.csrHosts?.split(","),
              })
              .setUrl(
                `https://${orderer2.user}:${orderer2.secret}@${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}:${ca.port}`
              )
              .build();

            logger.info(`Executing: ${command}`);
            await orchestrator.executeInContainer(
              containerName,
              command.split(" ")
            );

            // Normalize key filename
            logger.info(`Normalizing orderer-2 TLS private key filename.`);

            command = `mv /etc/hyperledger/client/orderers/orderer-2/tls/msp/keystore/* /etc/hyperledger/client/orderers/orderer-2/tls/msp/keystore/key.pem`;

            logger.info(`Executing: ${command}`);
            await orchestrator.exec(containerName, command, []);
          } catch (e: unknown) {
            err = e;
            logger.error(
              `Failed to register/enroll orderer identities.`,
              e as Error
            );
            expect(e).toBeUndefined();
            return;
          }
        });

        it("STEP-15 Registers/Enrolls Peers Identities", async () => {
          try {
            const peerName = `${DeploymentStage.PEER}-0`;

            //Resolve Container Name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;
            const peerContainerName = `${InfrastructureEnvironment.orgName}-${peerName}`;

            if (await orchestrator.isContainerRunning(peerContainerName)) {
              logger.info(
                `Peer container ${peerContainerName} is already running. Skipping identity registration and enrollment.`
              );
              return;
            }

            const ca = InfrastructureEnvironment.ca;
            const tls = InfrastructureEnvironment.tls;
            const peer0 = InfrastructureEnvironment.peer0;
            const peer1 = InfrastructureEnvironment.peer1;
            const peer2 = InfrastructureEnvironment.peer2;

            //########################################################
            // Handle Peers
            logger.info(
              `Registering and enrolling peer identities for organization ${InfrastructureEnvironment.orgName} (CA container: ${containerName}).`
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
                `https://${peer0.user}:${peer0.secret}@${InfrastructureEnvironment.orgName}-${DeploymentStage.TLS}:${tls.port}`
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
                `https://${peer0.user}:${peer0.secret}@${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}:${ca.port}`
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

            // Peer 1
            logger.info(`Processing peer-1 identity.`);

            // Register with ca
            logger.info(`Registering peer-1 with CA.`);

            builder = new FabricCAClientCommandBuilder();
            command = builder
              .setCommand(FabricCAClientCommand.REGISTER)
              .setIdentity({
                name: InfrastructureEnvironment.peer1.user,
                secret: InfrastructureEnvironment.peer1.secret,
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

            // Enroll peer tls
            logger.info(`Enrolling peer-1 TLS identity.`);

            builder = new FabricCAClientCommandBuilder();
            command = builder
              .setCommand(FabricCAClientCommand.ENROLL)
              .setEnrollment({ profile: "tls" })
              .setHome(`/etc/hyperledger/client/peers/peer-1/tls`)
              .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
              .setCSR({
                hosts: peer1.csrHosts.split(","),
              })
              .setUrl(
                `https://${peer1.user}:${peer1.secret}@${InfrastructureEnvironment.orgName}-${DeploymentStage.TLS}:${tls.port}`
              )
              .build();

            logger.info(`Executing: ${command}`);
            await orchestrator.executeInContainer(
              containerName,
              command.split(" ")
            );

            // Enroll with CA
            logger.info(`Enrolling peer-1 CA identity (MSP).`);

            builder = new FabricCAClientCommandBuilder();
            command = builder
              .setCommand(FabricCAClientCommand.ENROLL)
              .setHome(`/etc/hyperledger/client/peers/peer-1/ca`)
              .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
              .setCSR({
                hosts: peer1.csrHosts.split(","),
              })
              .setUrl(
                `https://${peer1.user}:${peer1.secret}@${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}:${ca.port}`
              )
              .build();

            logger.info(`Executing: ${command}`);
            await orchestrator.executeInContainer(
              containerName,
              command.split(" ")
            );

            logger.info(`Normalizing peer-1 TLS private key filename.`);
            command = `mv /etc/hyperledger/client/peers/peer-1/tls/msp/keystore/* /etc/hyperledger/client/peers/peer-1/tls/msp/keystore/key.pem`;

            logger.info(`Executing: ${command}`);
            await orchestrator.exec(containerName, command, []);

            //Copy admin msp to use when joining the channel
            logger.info(`Copying admin MSP to peer-1 directory.`);
            command = `cp -r /etc/hyperledger/client/admin /etc/hyperledger/client/peers/peer-1/`;

            logger.info(`Executing: ${command}`);
            await orchestrator.exec(containerName, command, []);

            // Peer 2
            logger.info(`Processing peer-2 identity.`);

            // Register with ca
            logger.info(`Registering peer-2 with CA.`);

            builder = new FabricCAClientCommandBuilder();
            command = builder
              .setCommand(FabricCAClientCommand.REGISTER)
              .setIdentity({
                name: peer2.user,
                secret: peer2.secret,
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

            // Enroll peer tls
            logger.info(`Enrolling peer-2 TLS identity.`);

            builder = new FabricCAClientCommandBuilder();
            command = builder
              .setCommand(FabricCAClientCommand.ENROLL)
              .setEnrollment({ profile: "tls" })
              .setHome(`/etc/hyperledger/client/peers/peer-2/tls`)
              .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
              .setCSR({
                hosts: peer2.csrHosts.split(","),
              })
              .setUrl(
                `https://${peer2.user}:${peer2.secret}@${InfrastructureEnvironment.orgName}-${DeploymentStage.TLS}:${tls.port}`
              )
              .build();

            logger.info(`Executing: ${command}`);
            await orchestrator.executeInContainer(
              containerName,
              command.split(" ")
            );

            // Enroll with CA
            logger.info(`Enrolling peer-2 CA identity (MSP).`);

            builder = new FabricCAClientCommandBuilder();
            command = builder
              .setCommand(FabricCAClientCommand.ENROLL)
              .setHome(`/etc/hyperledger/client/peers/peer-2/ca`)
              .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
              .setCSR({
                hosts: peer2.csrHosts.split(","),
              })
              .setUrl(
                `https://${peer2.user}:${peer2.secret}@${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}:${ca.port}`
              )
              .build();

            logger.info(`Executing: ${command}`);
            await orchestrator.executeInContainer(
              containerName,
              command.split(" ")
            );

            logger.info(`Normalizing peer-2 TLS private key filename.`);
            command = `mv /etc/hyperledger/client/peers/peer-2/tls/msp/keystore/* /etc/hyperledger/client/peers/peer-2/tls/msp/keystore/key.pem`;

            logger.info(`Executing: ${command}`);
            await orchestrator.exec(containerName, command, []);

            //Copy admin msp to use when joining the channel
            logger.info(`Copying admin MSP to peer-2 directory.`);
            command = `cp -r /etc/hyperledger/client/admin /etc/hyperledger/client/peers/peer-2/`;

            logger.info(`Executing: ${command}`);
            await orchestrator.exec(containerName, command, []);
          } catch (e: unknown) {
            err = e;
            expect(e).toBeUndefined();
            return;
          }
        });

        it("STEP-16 Registers/Enrolls CCAAS Identity", async () => {
          try {
            const peerName = `${DeploymentStage.PEER}-0`;

            //Resolve Container Name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;
            const peerContainerName = `${InfrastructureEnvironment.orgName}-${peerName}`;

            if (await orchestrator.isContainerRunning(peerContainerName)) {
              logger.info(
                `Peer container ${peerContainerName} is already running. Skipping identity registration and enrollment.`
              );
              return;
            }

            const tls = InfrastructureEnvironment.tls;

            const builder = new FabricCAClientCommandBuilder();

            let command = builder
              .setCommand(FabricCAClientCommand.ENROLL)
              .setEnrollment({ profile: "tls" })
              .setHome(`/etc/hyperledger/ccaas`)
              .setTLS({ certfiles: [`/etc/hyperledger/shared/tls-cert.pem`] })
              .setCSR({
                hosts: InfrastructureEnvironment.contract.csrHosts.split(","),
              })
              .setUrl(
                `https://${InfrastructureEnvironment.contract.user}:${InfrastructureEnvironment.contract.secret}@${InfrastructureEnvironment.orgName}-tls:${tls.port}`
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

            command = `cp -r /etc/hyperledger/ccaas/msp/tlsintermediatecerts/tls-${InfrastructureEnvironment.orgName}-tls-${tls.port}.pem \
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

        it("STEP-17 Create Organization MSP", async () => {
          try {
            //Resolve Container Name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;
            const peerContainerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`;

            //Check if container is already running. Skipping if already running...
            if (await orchestrator.isContainerRunning(peerContainerName)) {
              logger.info(
                `Peer-0 container ${peerContainerName} is already running. Skipping organization MSP generation.`
              );
              return;
            }

            logger.info(
              `Generating organization MSP for ${InfrastructureEnvironment.orgName} (CA container: ${containerName}).`
            );

            const mspFolder = path.join(
              __dirname,
              STORAGE_DIR_NAME,
              InfrastructureEnvironment.orgName,
              "msp"
            );

            fs.mkdirSync(mspFolder, { recursive: true });

            const nodeOU = {
              NodeOUs: {
                Enable: true,
                ClientOUIdentifier: {
                  Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                  OrganizationalUnitIdentifier: FabricAccountType.CLIENT,
                },
                AdminOUIdentifier: {
                  Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                  OrganizationalUnitIdentifier: FabricAccountType.ADMIN,
                },
                OrdererOUIdentifier: {
                  Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                  OrganizationalUnitIdentifier: FabricAccountType.ORDERER,
                },
                PeerOUIdentifier: {
                  Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
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
              `Organization MSP generated and populated successfully for ${InfrastructureEnvironment.orgName}.`
            );
          } catch (e: unknown) {
            err = e;
            logger.error(`Failed to generate organization MSP.`, e as Error);
            expect(e).toBeUndefined();
            return;
          }
        });
      });

      describe("Orderers", () => {
        describe("Orderer-0", () => {
          it("STEP-18 Generates Orderer Config", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-0`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Orderer-0 container ${containerName} is already running. Skipping configuration generation.`
                );
                return;
              }

              const orderer = InfrastructureEnvironment.orderer0;
              const hsm = InfrastructureEnvironment.hsm;

              logger.info(
                `Generating Orderer-0 configuration for organization ${InfrastructureEnvironment.orgName}.`
              );

              const baseOrdererPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
                DeploymentStage.CA,
                "client",
                "orderers"
              );

              const ordererMspPath = path.join(
                baseOrdererPath,
                "orderer-0",
                DeploymentStage.CA
              );

              fs.mkdirSync(ordererMspPath, { recursive: true });

              // Build configuration
              const builder = new FabricOrdererConfigBuilder();

              builder
                .setConsensus({
                  WALDir: "/etc/hyperledger/fabric/etcdraft/wal",
                  SnapDir: "/etc/hyperledger/fabric/etcdraft/snapshot",
                })
                .setOperations({
                  ListenAddress: orderer.operationsAddress,
                })
                .setPort(orderer.port)
                .setTLS({
                  Enabled: true,
                  PrivateKey: `/etc/hyperledger/fabric/tls/msp/keystore/key.pem`,
                  Certificate: `/etc/hyperledger/fabric/tls/msp/signcerts/cert.pem`,
                  RootCAs: [`/etc/hyperledger/shared/tls-cert.pem`],
                })
                .setAdmin({
                  ListenAddress: `0.0.0.0:${orderer.osnPort}`,
                  TLS: {
                    Enabled: true,
                    Certificate: `/etc/hyperledger/fabric/tls/msp/signcerts/cert.pem`,
                    PrivateKey: `/etc/hyperledger/fabric/tls/msp/keystore/key.pem`,
                    ClientAuthRequired: true,
                    ClientRootCAs: [`/etc/hyperledger/shared/tls-cert.pem`],
                    RootCAs: [`/etc/hyperledger/shared/tls-cert.pem`],
                  },
                })
                .setLocalMSP({
                  LocalMSPDir: "/etc/hyperledger/fabric/ca/msp",
                  LocalMSPID: `${capitalize(InfrastructureEnvironment.orgName.toLowerCase())}MSP`,
                })
                .setChannelParticipation({ Enabled: true })
                .setBootstrap({ BootstrapMethod: "none" })
                .setListenAddress("0.0.0.0");

              if (hsm.enabled)
                builder.setBCCSP({
                  Default: "PKCS11",
                  PKCS11: {
                    Library: hsm.lib,
                    Pin: hsm.pin,
                    Label: hsm.label,
                    Hash: "SHA2",
                    Security: 256,
                    Immutable: false,
                    ...(hsm.altId ? { AltID: hsm.altId } : {}),
                  },
                } as any);

              builder.save(ordererMspPath);

              logger.info(
                `Orderer-0 configuration generated successfully for organization ${InfrastructureEnvironment.orgName}.`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(
                `Failed to generate Orderer-0 configuration.`,
                e as Error
              );
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-19 Create NodeOU config files and populate the volumes", async () => {
            try {
              const ordererContainerName = `${InfrastructureEnvironment.orgName}-orderer-0`;

              if (await orchestrator.isContainerRunning(ordererContainerName)) {
                logger.info(
                  `Orderer container ${ordererContainerName} is already running. Skipping NodeOU configuration generation.`
                );
                return;
              }

              logger.info(
                `Generating NodeOU configuration for orderer MSP (org: ${InfrastructureEnvironment.orgName}).`
              );

              const baseOrdererPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
                DeploymentStage.CA,
                "client",
                "orderers"
              );

              const ordererFolder = path.join(
                baseOrdererPath,
                "orderer-0",
                DeploymentStage.CA
              );

              const mspPath = path.join(ordererFolder, "msp");

              fs.mkdirSync(mspPath, { recursive: true });

              const nodeOU = {
                NodeOUs: {
                  Enable: true,
                  ClientOUIdentifier: {
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                    OrganizationalUnitIdentifier: FabricAccountType.CLIENT,
                  },
                  AdminOUIdentifier: {
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                    OrganizationalUnitIdentifier: FabricAccountType.ADMIN,
                  },
                  OrdererOUIdentifier: {
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                    OrganizationalUnitIdentifier: FabricAccountType.ORDERER,
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
                `Failed to generate NodeOU configuration for orderer MSP.`,
                e as Error
              );
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-20 Populates Orderer Volume", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-0`;
              const caContainerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Orderer-0 container ${containerName} is already running. Skipping orderer volume population.`
                );
                return;
              }

              const baseOrdererPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
                DeploymentStage.CA,
                "client",
                "orderers"
              );

              const ordererFolder = path.join(
                baseOrdererPath,
                "orderer-0",
                DeploymentStage.CA
              );

              const mspPath = path.join(ordererFolder, "msp/config.yaml");
              const ordererPath = path.join(ordererFolder, "orderer.yaml");

              logger.info(
                `Populating Orderer-0 volume in CA container ${caContainerName} with MSP and orderer configuration.`
              );

              await orchestrator.copyToAndFromContainer(
                caContainerName,
                mspPath,
                "/etc/hyperledger/client/orderers/orderer-0/ca/msp/config.yaml"
              );

              logger.info(
                `Copied orderer-0 MSP config.yaml to CA container ${caContainerName}.`
              );

              await orchestrator.copyToAndFromContainer(
                caContainerName,
                ordererPath,
                "/etc/hyperledger/client/orderers/orderer-0/ca/orderer.yaml"
              );

              logger.info(
                `Copied orderer-0 orderer.yaml to CA container ${caContainerName}.`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(`Failed to populate Orderer-0 volume.`, e as Error);
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-21 Starts Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-0`;

              const orderer = InfrastructureEnvironment.orderer0;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Orderer-0 container ${containerName} is already running. Skipping startup.`
                );
                return;
              }

              logger.info(
                `Starting Orderer-0 service for organization ${InfrastructureEnvironment.orgName} (container: ${containerName}).`
              );

              const env = Object.assign({}, process.env, baseEnv, {
                IMAGE: orderer.image,
                OPERATIONS_ADDRESS: orderer.operationsAddress,
                PORT: orderer.port,
                OSN_PORT: orderer.port,
              });

              // Start Orderer service
              await orchestrator.serviceUp(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.ORDERER}-0`,
                dockerComposePath,
                { env }
              );

              logger.info(
                `Orderer-0 container ${containerName} started. Waiting for readiness.`
              );

              await orchestrator.awaitContainerReadiness(containerName);

              logger.info(
                `Orderer-0 container ${containerName} is healthy and ready.`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(`Failed to start Orderer-0 container.`, e as Error);
              expect(e).toBeUndefined();
              return;
            }
          });
        });

        describe("Orderer-1", () => {
          it("STEP-22 Generates Orderer Config", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-1`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Orderer-1 container ${containerName} is already running. Skipping configuration generation.`
                );
                return;
              }
              const orderer = InfrastructureEnvironment.orderer1;
              const hsm = InfrastructureEnvironment.hsm;

              logger.info(
                `Generating Orderer-1 configuration for organization ${InfrastructureEnvironment.orgName}.`
              );

              const baseOrdererPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
                DeploymentStage.CA,
                "client",
                "orderers"
              );

              const ordererMspPath = path.join(
                baseOrdererPath,
                "orderer-1",
                DeploymentStage.CA
              );

              fs.mkdirSync(ordererMspPath, { recursive: true });

              // Build configuration
              const builder = new FabricOrdererConfigBuilder();

              builder
                .setConsensus({
                  WALDir: "/etc/hyperledger/fabric/etcdraft/wal",
                  SnapDir: "/etc/hyperledger/fabric/etcdraft/snapshot",
                })
                .setOperations({
                  ListenAddress: orderer.operationsAddress,
                })
                .setPort(orderer.port)
                .setTLS({
                  Enabled: true,
                  PrivateKey: `/etc/hyperledger/fabric/tls/msp/keystore/key.pem`,
                  Certificate: `/etc/hyperledger/fabric/tls/msp/signcerts/cert.pem`,
                  RootCAs: [`/etc/hyperledger/shared/tls-cert.pem`],
                })
                .setAdmin({
                  ListenAddress: `0.0.0.0:${orderer.osnPort}`,
                  TLS: {
                    Enabled: true,
                    Certificate: `/etc/hyperledger/fabric/tls/msp/signcerts/cert.pem`,
                    PrivateKey: `/etc/hyperledger/fabric/tls/msp/keystore/key.pem`,
                    ClientAuthRequired: true,
                    ClientRootCAs: [`/etc/hyperledger/shared/tls-cert.pem`],
                    RootCAs: [`/etc/hyperledger/shared/tls-cert.pem`],
                  },
                })
                .setLocalMSP({
                  LocalMSPDir: "/etc/hyperledger/fabric/ca/msp",
                  LocalMSPID: `${capitalize(InfrastructureEnvironment.orgName.toLowerCase())}MSP`,
                })
                .setChannelParticipation({ Enabled: true })
                .setBootstrap({ BootstrapMethod: "none" })
                .setListenAddress("0.0.0.0");

              if (hsm.enabled)
                builder.setBCCSP({
                  Default: "PKCS11",
                  PKCS11: {
                    Library: hsm.lib,
                    Pin: hsm.pin,
                    Label: hsm.label,
                    Hash: "SHA2",
                    Security: 256,
                    Immutable: false,
                    ...(hsm.altId ? { AltID: hsm.altId } : {}),
                  },
                } as any);

              builder.save(ordererMspPath);

              logger.info(
                `Orderer-1 configuration generated successfully for organization ${InfrastructureEnvironment.orgName}.`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(
                `Failed to generate Orderer-1 configuration.`,
                e as Error
              );
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-23 Create NodeOU config files and populate the volumes", async () => {
            try {
              const ordererContainerName = `${InfrastructureEnvironment.orgName}-orderer-1`;

              if (await orchestrator.isContainerRunning(ordererContainerName)) {
                logger.info(
                  `Orderer container ${ordererContainerName} is already running. Skipping NodeOU configuration generation.`
                );
                return;
              }

              logger.info(
                `Generating NodeOU configuration for orderer-1 MSP (org: ${InfrastructureEnvironment.orgName}).`
              );

              const baseOrdererPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
                DeploymentStage.CA,
                "client",
                "orderers"
              );

              const mspPath = path.join(
                baseOrdererPath,
                "orderer-1",
                DeploymentStage.CA,
                "msp"
              );

              fs.mkdirSync(mspPath, { recursive: true });

              const nodeOU = {
                NodeOUs: {
                  Enable: true,
                  ClientOUIdentifier: {
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                    OrganizationalUnitIdentifier: FabricAccountType.CLIENT,
                  },
                  AdminOUIdentifier: {
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                    OrganizationalUnitIdentifier: FabricAccountType.ADMIN,
                  },
                  OrdererOUIdentifier: {
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                    OrganizationalUnitIdentifier: FabricAccountType.ORDERER,
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
                `Failed to generate NodeOU configuration for orderer-1 MSP.`,
                e as Error
              );

              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-24 Populates Orderer Volume", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-1`;
              const caContainerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Orderer-1 container ${containerName} is already running. Skipping orderer volume population.`
                );
                return;
              }

              const baseOrdererPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
                DeploymentStage.CA,
                "client",
                "orderers"
              );

              const ordererFolder = path.join(
                baseOrdererPath,
                "orderer-1",
                DeploymentStage.CA
              );

              const mspPath = path.join(ordererFolder, "msp/config.yaml");
              const ordererPath = path.join(ordererFolder, "orderer.yaml");

              logger.info(
                `Populating Orderer-1 volume in CA container ${caContainerName} with MSP and orderer configuration.`
              );

              await orchestrator.copyToAndFromContainer(
                caContainerName,
                mspPath,
                "/etc/hyperledger/client/orderers/orderer-1/ca/msp/config.yaml"
              );

              logger.info(
                `Copied orderer-1 MSP config.yaml to CA container ${caContainerName}.`
              );

              await orchestrator.copyToAndFromContainer(
                caContainerName,
                ordererPath,
                "/etc/hyperledger/client/orderers/orderer-1/ca/orderer.yaml"
              );

              logger.info(
                `Copied orderer-1 orderer.yaml to CA container ${caContainerName}.`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(`Failed to populate Orderer-1 volume.`, e as Error);
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-25 Starts Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-1`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Orderer-1 container ${containerName} is already running. Skipping startup.`
                );
                return;
              }

              const orderer = InfrastructureEnvironment.orderer1;

              logger.info(
                `Starting Orderer-1 service for organization ${InfrastructureEnvironment.orgName} (container: ${containerName}).`
              );

              const env = Object.assign({}, process.env, baseEnv, {
                IMAGE: orderer.image,
                OPERATIONS_ADDRESS: orderer.operationsAddress,
                PORT: orderer.port,
                OSN_PORT: orderer.osnPort,
              });

              // Start CA service
              await orchestrator.serviceUp(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.ORDERER}-1`,
                dockerComposePath,
                { env }
              );

              logger.info(
                `Orderer-1 container ${containerName} started. Waiting for readiness.`
              );

              await orchestrator.awaitContainerReadiness(containerName);

              logger.info(
                `Orderer-1 container ${containerName} is healthy and ready.`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(`Failed to start Orderer-1 container.`, e as Error);
              expect(e).toBeUndefined();
              return;
            }
          });
        });

        describe("Orderer-2", () => {
          it("STEP-26 Generates Orderer Config", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-2`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Orderer-2 container ${containerName} is already running. Skipping configuration generation.`
                );
                return;
              }

              const orderer = InfrastructureEnvironment.orderer2;
              const hsm = InfrastructureEnvironment.hsm;

              logger.info(
                `Generating Orderer-2 configuration for organization ${InfrastructureEnvironment.orgName}.`
              );

              const baseOrdererPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
                DeploymentStage.CA,
                "client",
                "orderers"
              );

              const ordererMspPath = path.join(
                baseOrdererPath,
                "orderer-2",
                DeploymentStage.CA
              );

              fs.mkdirSync(ordererMspPath, { recursive: true });

              // Build configuration
              const builder = new FabricOrdererConfigBuilder();

              builder
                .setConsensus({
                  WALDir: "/etc/hyperledger/fabric/etcdraft/wal",
                  SnapDir: "/etc/hyperledger/fabric/etcdraft/snapshot",
                })
                .setOperations({
                  ListenAddress: orderer.operationsAddress,
                })
                .setPort(orderer.port)
                .setTLS({
                  Enabled: true,
                  PrivateKey: `/etc/hyperledger/fabric/tls/msp/keystore/key.pem`,
                  Certificate: `/etc/hyperledger/fabric/tls/msp/signcerts/cert.pem`,
                  RootCAs: [`/etc/hyperledger/shared/tls-cert.pem`],
                })
                .setAdmin({
                  ListenAddress: `0.0.0.0:${orderer.osnPort}`,
                  TLS: {
                    Enabled: true,
                    Certificate: `/etc/hyperledger/fabric/tls/msp/signcerts/cert.pem`,
                    PrivateKey: `/etc/hyperledger/fabric/tls/msp/keystore/key.pem`,
                    ClientAuthRequired: true,
                    ClientRootCAs: [`/etc/hyperledger/shared/tls-cert.pem`],
                    RootCAs: [`/etc/hyperledger/shared/tls-cert.pem`],
                  },
                })
                .setLocalMSP({
                  LocalMSPDir: "/etc/hyperledger/fabric/ca/msp",
                  LocalMSPID: `${capitalize(InfrastructureEnvironment.orgName.toLowerCase())}MSP`,
                })
                .setChannelParticipation({ Enabled: true })
                .setBootstrap({ BootstrapMethod: "none" })
                .setListenAddress("0.0.0.0");

              if (hsm.enabled)
                builder.setBCCSP({
                  Default: "PKCS11",
                  PKCS11: {
                    Library: hsm.lib,
                    Pin: hsm.pin,
                    Label: hsm.label,
                    Hash: "SHA2",
                    Security: 256,
                    Immutable: false,
                    ...(hsm.altId ? { AltID: hsm.altId } : {}),
                  },
                } as any);

              builder.save(ordererMspPath);

              logger.info(
                `Orderer-2 configuration generated successfully for organization ${InfrastructureEnvironment.orgName}.`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(
                `Failed to generate Orderer-2 configuration.`,
                e as Error
              );
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-27 Create NodeOU config files and populate the volumes", async () => {
            try {
              const ordererContainerName = `${InfrastructureEnvironment.orgName}-orderer-2`;

              if (await orchestrator.isContainerRunning(ordererContainerName)) {
                logger.info(
                  `Orderer container ${ordererContainerName} is already running. Skipping NodeOU configuration generation.`
                );
                return;
              }

              logger.info(
                `Generating NodeOU configuration for orderer-2 MSP (org: ${InfrastructureEnvironment.orgName}).`
              );

              const baseOrdererPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
                DeploymentStage.CA,
                "client",
                "orderers"
              );

              const mspPath = path.join(
                baseOrdererPath,
                "orderer-2",
                DeploymentStage.CA,
                "msp"
              );

              fs.mkdirSync(mspPath, { recursive: true });

              const nodeOU = {
                NodeOUs: {
                  Enable: true,
                  ClientOUIdentifier: {
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                    OrganizationalUnitIdentifier: FabricAccountType.CLIENT,
                  },
                  AdminOUIdentifier: {
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                    OrganizationalUnitIdentifier: FabricAccountType.ADMIN,
                  },
                  OrdererOUIdentifier: {
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                    OrganizationalUnitIdentifier: FabricAccountType.ORDERER,
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
                `Failed to generate NodeOU configuration for orderer-2 MSP.`,
                e as Error
              );
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-28 Populates Orderer Volume", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-2`;
              const caContainerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Orderer-2 container ${containerName} is already running. Skipping orderer volume population.`
                );
                return;
              }

              const baseOrdererPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
                DeploymentStage.CA,
                "client",
                "orderers"
              );

              const ordererFolder = path.join(
                baseOrdererPath,
                "orderer-2",
                DeploymentStage.CA
              );

              const mspPath = path.join(ordererFolder, "msp/config.yaml");
              const ordererPath = path.join(ordererFolder, "orderer.yaml");

              logger.info(
                `Populating Orderer-2 volume in CA container ${caContainerName} with MSP and orderer configuration.`
              );

              await orchestrator.copyToAndFromContainer(
                caContainerName,
                mspPath,
                "/etc/hyperledger/client/orderers/orderer-2/ca/msp/config.yaml"
              );

              logger.info(
                `Copied orderer-2 MSP config.yaml to CA container ${caContainerName}.`
              );

              await orchestrator.copyToAndFromContainer(
                caContainerName,
                ordererPath,
                "/etc/hyperledger/client/orderers/orderer-2/ca/orderer.yaml"
              );

              logger.info(
                `Copied orderer-2 orderer.yaml to CA container ${caContainerName}.`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(`Failed to populate Orderer-2 volume.`, e as Error);
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-29 Starts Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-2`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Orderer-2 container ${containerName} is already running. Skipping startup.`
                );
                return;
              }
              const orderer = InfrastructureEnvironment.orderer2;

              logger.info(
                `Starting Orderer-2 service for organization ${InfrastructureEnvironment.orgName} (container: ${containerName}).`
              );

              const env = Object.assign({}, process.env, baseEnv, {
                IMAGE: orderer.image,
                OPERATIONS_ADDRESS: orderer.operationsAddress,
                PORT: orderer.port,
                OSN_PORT: orderer.port,
              });

              // Start CA service
              await orchestrator.serviceUp(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.ORDERER}-2`,
                dockerComposePath,
                { env }
              );

              logger.info(
                `Orderer-2 container ${containerName} started. Waiting for readiness.`
              );

              await orchestrator.awaitContainerReadiness(containerName);

              logger.info(
                `Orderer-2 container ${containerName} is healthy and ready.`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(`Failed to start Orderer-2 container.`, e as Error);
              expect(e).toBeUndefined();
              return;
            }
          });
        });
      });

      describe("Peers", () => {
        describe("Peer-0", () => {
          it("STEP-30 Starts DB Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0-${DeploymentStage.COUCHDB}`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Peer-0 CouchDB container ${containerName} is already running. Skipping startup.`
                );
                return;
              }

              const peer = InfrastructureEnvironment.peer0;

              logger.info(
                `Starting CouchDB service for peer-0 (org: ${InfrastructureEnvironment.orgName}, container: ${containerName}).`
              );

              const env = Object.assign({}, process.env, baseEnv, {
                COUCHDB_IMAGE: peer.couchdbImage,
                COUCHDB_USER: peer.couchdbUser,
                COUCHDB_SECRET: peer.couchdbSecret,
                ORG_NAME: InfrastructureEnvironment.orgName,
                COUCHDB_PORT: peer.couchdbPort,
              });

              // Start Orderer service
              await orchestrator.serviceUp(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.PEER}-0-${DeploymentStage.COUCHDB}`,
                dockerComposePath,
                { env }
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

          it("STEP-31 Generates Peer Config", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Peer-0 container ${containerName} is already running. Skipping configuration generation.`
                );
                return;
              }

              const peer = InfrastructureEnvironment.peer0;
              const hsm = InfrastructureEnvironment.hsm;

              logger.info(
                `Generating Peer-0 configuration for organization ${InfrastructureEnvironment.orgName}.`
              );

              const basePeerPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
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
                  externalEndpoint: `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0:${peer.port}`, //This should be the public hostname and port
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
                    file: `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${InfrastructureEnvironment.orgName}-tls-${InfrastructureEnvironment.tls.port}.pem`, // `/etc/hyperledger/shared/tls-cert.pem`,
                  },
                  clientRootCAs: {
                    files: [
                      `/etc/hyperledger/fabric/tls/msp/tlscacerts/tls-${InfrastructureEnvironment.orgName}-tls-${InfrastructureEnvironment.tls.port}.pem`,
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
                  id: `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`,
                  networkId: `${InfrastructureEnvironment.orgName}_network`,
                  address: `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0:${peer.port}`,
                  listenAddress: `0.0.0.0:${peer.port}`,
                  fileSystemPath: `/etc/hyperledger/fabric/production`,
                  chaincodeListenAddress: `0.0.0.0:${peer.chaincodePort}`, //`${name}-${peer.name}:${p.PEER_CHAINCODE_PORT}`,
                })
                .setOperations({
                  listenAddress: peer.operationsAddress,
                })
                .setMspConfig({
                  localMspId: `${capitalize(InfrastructureEnvironment.orgName.toLowerCase())}MSP`,
                  mspConfigPath: `/etc/hyperledger/fabric/ca/msp`,
                })
                .setLedgerState({
                  stateDatabase: "CouchDB",
                  couchDBConfig: {
                    username: peer.couchdbUser,
                    password: peer.couchdbSecret,
                    couchDBAddress: `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0-${DeploymentStage.COUCHDB}:5984`, // Hardcoding since it is using internal network
                  },
                })
                .setVMOptions({
                  docker: {
                    hostConfig: {
                      NetworkMode: `${InfrastructureEnvironment.orgName}_network`,
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
                `Peer-0 configuration generated successfully for organization ${InfrastructureEnvironment.orgName}.`
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

          it("STEP-32 Create NodeOU config files and populate the volumes", async () => {
            try {
              const peerContainerName = `${InfrastructureEnvironment.orgName}-peer-0`;

              if (await orchestrator.isContainerRunning(peerContainerName)) {
                logger.info(
                  `Peer container ${peerContainerName} is already running. Skipping NodeOU configuration generation.`
                );
                return;
              }

              logger.info(
                `Generating NodeOU configuration for peer-0 MSP (org: ${InfrastructureEnvironment.orgName}).`
              );

              const basePeerPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
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
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                    OrganizationalUnitIdentifier: FabricAccountType.CLIENT,
                  },
                  AdminOUIdentifier: {
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                    OrganizationalUnitIdentifier: FabricAccountType.ADMIN,
                  },
                  PeerOUIdentifier: {
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
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

          it("STEP-33 Populates Peer Volume", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`;
              const caContainerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Peer-0 container ${containerName} is already running. Skipping peer volume population.`
                );
                return;
              }

              const basePeerPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
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

          it("STEP-34 Starts Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Peer-0 container ${containerName} is already running. Skipping startup.`
                );
                return;
              }
              const peer = InfrastructureEnvironment.peer0;

              logger.info(
                `Starting Peer-0 service for organization ${InfrastructureEnvironment.orgName} (container: ${containerName}).`
              );

              const env = Object.assign({}, process.env, baseEnv, {
                IMAGE: peer.image,
                OPERATIONS_ADDRESS: peer.operationsAddress,
                PORT: peer.port,
              });

              // Start Orderer service
              await orchestrator.serviceUp(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.PEER}-0`,
                dockerComposePath,
                { env }
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

          it("STEP-35 Generates Peer TLS Cert For Client", async () => {
            try {
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`;

              const localPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName
              );

              const intPem = path.join(localPath, "peer-0-int.pem");
              const rootPem = path.join(localPath, "peer-0-root.pem");
              const chainPem = path.join(localPath, "peer-0-tls.pem");

              await orchestrator.copyToAndFromContainer(
                containerName,
                `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${InfrastructureEnvironment.orgName}-tls-${InfrastructureEnvironment.tls.port}.pem`,
                intPem,
                "from"
              );

              await orchestrator.copyToAndFromContainer(
                containerName,
                `/etc/hyperledger/fabric/tls/msp/tlscacerts/tls-${InfrastructureEnvironment.orgName}-tls-${InfrastructureEnvironment.tls.port}.pem`,
                rootPem,
                "from"
              );

              execSync(`cat ${intPem} ${rootPem} > ${chainPem}`);

              await orchestrator.copyToAndFromContainer(
                containerName,
                chainPem,
                `/etc/hyperledger/shared/peer-0-tls.pem`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(`Failed to Peer-0 TLS Cert.`, e as Error);
              expect(e).toBeUndefined();
              return;
            }
          });
        });

        describe("Peer-1", () => {
          it("STEP-36 Starts DB Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-1-${DeploymentStage.COUCHDB}`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Peer-1 CouchDB container ${containerName} is already running. Skipping startup.`
                );
                return;
              }

              const peer = InfrastructureEnvironment.peer1;

              logger.info(
                `Starting CouchDB service for peer-1 (org: ${InfrastructureEnvironment.orgName}, container: ${containerName}).`
              );

              const env = Object.assign({}, process.env, baseEnv, {
                COUCHDB_IMAGE: peer.couchdbImage,
                COUCHDB_USER: peer.couchdbUser,
                COUCHDB_SECRET: peer.couchdbSecret,
                ORG_NAME: InfrastructureEnvironment.orgName,
                COUCHDB_PORT: peer.couchdbPort,
              });

              // Start Orderer service
              await orchestrator.serviceUp(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.PEER}-1-${DeploymentStage.COUCHDB}`,
                dockerComposePath,
                { env }
              );

              logger.info(
                `Peer-1 CouchDB container ${containerName} started. Waiting for readiness.`
              );

              await orchestrator.awaitContainerReadiness(containerName);

              logger.info(
                `Peer-1 CouchDB container ${containerName} is healthy and ready.`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(
                `Failed to start Peer-1 CouchDB container.`,
                e as Error
              );
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-37 Generates Peer Config", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-1`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Peer-1 container ${containerName} is already running. Skipping configuration generation.`
                );
                return;
              }

              const peer = InfrastructureEnvironment.peer1;
              const hsm = InfrastructureEnvironment.hsm;

              logger.info(
                `Generating Peer-1 configuration for organization ${InfrastructureEnvironment.orgName}.`
              );

              const basePeerPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
                DeploymentStage.CA,
                "client",
                "peers"
              );

              const peerMspPath = path.join(
                basePeerPath,
                `${DeploymentStage.PEER}-1`,
                DeploymentStage.CA
              );

              fs.mkdirSync(peerMspPath, { recursive: true });

              // Build configuration
              const builder = new FabricPeerConfigBuilder();

              builder
                .setGossip({
                  bootstrap: `127.0.0.1:${peer.port}`,
                  externalEndpoint: `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-1:${peer.port}`, //This should be the public hostname and port
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
                    file: `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${InfrastructureEnvironment.orgName}-tls-${InfrastructureEnvironment.tls.port}.pem`, // `/etc/hyperledger/shared/tls-cert.pem`,
                  },
                  clientRootCAs: {
                    files: [
                      `/etc/hyperledger/fabric/tls/msp/tlscacerts/tls-${InfrastructureEnvironment.orgName}-tls-${InfrastructureEnvironment.tls.port}.pem`,
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
                  id: `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-1`,
                  networkId: `${InfrastructureEnvironment.orgName}_network`,
                  address: `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-1:${peer.port}`,
                  listenAddress: `0.0.0.0:${peer.port}`,
                  fileSystemPath: `/etc/hyperledger/fabric/production`,
                  chaincodeListenAddress: `0.0.0.0:${peer.chaincodePort}`, //`${name}-${peer.name}:${p.PEER_CHAINCODE_PORT}`,
                })
                .setOperations({
                  listenAddress: peer.operationsAddress,
                })
                .setMspConfig({
                  localMspId: `${capitalize(InfrastructureEnvironment.orgName.toLowerCase())}MSP`,
                  mspConfigPath: `/etc/hyperledger/fabric/ca/msp`,
                })
                .setLedgerState({
                  stateDatabase: "CouchDB",
                  couchDBConfig: {
                    username: peer.couchdbUser,
                    password: peer.couchdbSecret,
                    couchDBAddress: `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-1-${DeploymentStage.COUCHDB}:5984`, // Hardcoding since it is using internal network
                  },
                })
                .setVMOptions({
                  docker: {
                    hostConfig: {
                      NetworkMode: `${InfrastructureEnvironment.orgName}_network`,
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
                `Peer-1 configuration generated successfully for organization ${InfrastructureEnvironment.orgName}.`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(
                `Failed to generate Peer-1 configuration.`,
                e as Error
              );
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-38 Create NodeOU config files and populate the volumes", async () => {
            try {
              const peerContainerName = `${InfrastructureEnvironment.orgName}-peer-1`;

              if (await orchestrator.isContainerRunning(peerContainerName)) {
                logger.info(
                  `Peer container ${peerContainerName} is already running. Skipping NodeOU configuration generation.`
                );
                return;
              }

              logger.info(
                `Generating NodeOU configuration for peer-1 MSP (org: ${InfrastructureEnvironment.orgName}).`
              );

              const basePeerPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
                DeploymentStage.CA,
                "client",
                "peers"
              );

              const peerFolder = path.join(
                basePeerPath,
                "peer-1",
                DeploymentStage.CA
              );

              const mspPath = path.join(peerFolder, "msp");

              fs.mkdirSync(mspPath, { recursive: true });

              const nodeOU = {
                NodeOUs: {
                  Enable: true,
                  ClientOUIdentifier: {
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                    OrganizationalUnitIdentifier: FabricAccountType.CLIENT,
                  },
                  AdminOUIdentifier: {
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                    OrganizationalUnitIdentifier: FabricAccountType.ADMIN,
                  },
                  PeerOUIdentifier: {
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
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
                `Failed to generate NodeOU configuration for peer-1 MSP.`,
                e as Error
              );
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-39 Populates Peer Volume", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-1`;
              const caContainerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Peer-1 container ${containerName} is already running. Skipping peer volume population.`
                );
                return;
              }

              const basePeerPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
                DeploymentStage.CA,
                "client",
                "peers"
              );

              const peerFolder = path.join(
                basePeerPath,
                "peer-1",
                DeploymentStage.CA
              );

              const mspPath = path.join(peerFolder, "msp/config.yaml");
              const peerPath = path.join(peerFolder, "core.yaml");

              logger.info(
                `Populating Peer-1 volume in CA container ${caContainerName} with MSP and peer configuration.`
              );

              await orchestrator.copyToAndFromContainer(
                caContainerName,
                mspPath,
                "/etc/hyperledger/client/peers/peer-1/ca/msp/config.yaml"
              );

              logger.info(
                `Copied peer-1 MSP config.yaml to CA container ${caContainerName}.`
              );

              await orchestrator.copyToAndFromContainer(
                caContainerName,
                peerPath,
                "/etc/hyperledger/client/peers/peer-1/ca/core.yaml"
              );

              logger.info(
                `Copied peer-1 core.yaml to CA container ${caContainerName}.`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(`Failed to populate Peer-1 volume.`, e as Error);
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-40 Starts Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-1`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Peer-1 container ${containerName} is already running. Skipping startup.`
                );
                return;
              }

              const peer = InfrastructureEnvironment.peer1;

              logger.info(
                `Starting Peer-1 service for organization ${InfrastructureEnvironment.orgName} (container: ${containerName}).`
              );

              const env = Object.assign({}, process.env, baseEnv, {
                IMAGE: peer.image,
                OPERATIONS_ADDRESS: peer.operationsAddress,
                PORT: peer.port,
              });

              // Start Orderer service
              await orchestrator.serviceUp(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.PEER}-1`,
                dockerComposePath,
                { env }
              );

              logger.info(
                `Peer-1 container ${containerName} started. Waiting for readiness.`
              );

              await orchestrator.awaitContainerReadiness(containerName);

              logger.info(
                `Peer-1 container ${containerName} is healthy and ready.`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(`Failed to start Peer-1 container.`, e as Error);
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-41 Generates Peer TLS Cert For Client", async () => {
            try {
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-1`;

              const localPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName
              );

              const intPem = path.join(localPath, "peer-1-int.pem");
              const rootPem = path.join(localPath, "peer-1-root.pem");
              const chainPem = path.join(localPath, "peer-1-tls.pem");

              await orchestrator.copyToAndFromContainer(
                containerName,
                `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${InfrastructureEnvironment.orgName}-tls-${InfrastructureEnvironment.tls.port}.pem`,
                intPem,
                "from"
              );

              await orchestrator.copyToAndFromContainer(
                containerName,
                `/etc/hyperledger/fabric/tls/msp/tlscacerts/tls-${InfrastructureEnvironment.orgName}-tls-${InfrastructureEnvironment.tls.port}.pem`,
                rootPem,
                "from"
              );

              execSync(`cat ${intPem} ${rootPem} > ${chainPem}`);

              await orchestrator.copyToAndFromContainer(
                containerName,
                chainPem,
                `/etc/hyperledger/shared/peer-1-tls.pem`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(`Failed to Peer-1 TLS Cert.`, e as Error);
              expect(e).toBeUndefined();
              return;
            }
          });
        });

        describe("Peer-2", () => {
          it("STEP-42 Starts DB Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-2-${DeploymentStage.COUCHDB}`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Peer-2 CouchDB container ${containerName} is already running. Skipping startup.`
                );
                return;
              }

              const peer = InfrastructureEnvironment.peer2;

              logger.info(
                `Starting CouchDB service for peer-2 (org: ${InfrastructureEnvironment.orgName}, container: ${containerName}).`
              );

              const env = Object.assign({}, process.env, baseEnv, {
                COUCHDB_IMAGE: peer.couchdbImage,
                COUCHDB_USER: peer.couchdbUser,
                COUCHDB_SECRET: peer.couchdbSecret,
                ORG_NAME: InfrastructureEnvironment.orgName,
                COUCHDB_PORT: peer.couchdbPort,
              });

              // Start Orderer service
              await orchestrator.serviceUp(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.PEER}-2-${DeploymentStage.COUCHDB}`,
                dockerComposePath,
                { env }
              );

              logger.info(
                `Peer-2 CouchDB container ${containerName} started. Waiting for readiness.`
              );

              await orchestrator.awaitContainerReadiness(containerName);

              logger.info(
                `Peer-2 CouchDB container ${containerName} is healthy and ready.`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(
                `Failed to start Peer-2 CouchDB container.`,
                e as Error
              );
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-43 Generates Peer Config", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-2`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Peer-2 container ${containerName} is already running. Skipping configuration generation.`
                );
                return;
              }

              const peer = InfrastructureEnvironment.peer2;
              const hsm = InfrastructureEnvironment.hsm;

              logger.info(
                `Generating Peer-2 configuration for organization ${InfrastructureEnvironment.orgName}.`
              );

              const basePeerPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
                DeploymentStage.CA,
                "client",
                "peers"
              );

              const peerMspPath = path.join(
                basePeerPath,
                `${DeploymentStage.PEER}-2`,
                DeploymentStage.CA
              );

              fs.mkdirSync(peerMspPath, { recursive: true });

              // Build configuration
              const builder = new FabricPeerConfigBuilder();

              builder
                .setGossip({
                  bootstrap: `127.0.0.1:${peer.port}`,
                  externalEndpoint: `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-2:${peer.port}`, //This should be the public hostname and port
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
                    file: `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${InfrastructureEnvironment.orgName}-tls-${InfrastructureEnvironment.tls.port}.pem`, // `/etc/hyperledger/shared/tls-cert.pem`,
                  },
                  clientRootCAs: {
                    files: [
                      `/etc/hyperledger/fabric/tls/msp/tlscacerts/tls-${InfrastructureEnvironment.orgName}-tls-${InfrastructureEnvironment.tls.port}.pem`,
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
                  id: `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-2`,
                  networkId: `${InfrastructureEnvironment.orgName}_network`,
                  address: `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-2:${peer.port}`,
                  listenAddress: `0.0.0.0:${peer.port}`,
                  fileSystemPath: `/etc/hyperledger/fabric/production`,
                  chaincodeListenAddress: `0.0.0.0:${peer.chaincodePort}`, //`${name}-${peer.name}:${p.PEER_CHAINCODE_PORT}`,
                })
                .setOperations({
                  listenAddress: peer.operationsAddress,
                })
                .setMspConfig({
                  localMspId: `${capitalize(InfrastructureEnvironment.orgName.toLowerCase())}MSP`,
                  mspConfigPath: `/etc/hyperledger/fabric/ca/msp`,
                })
                .setLedgerState({
                  stateDatabase: "CouchDB",
                  couchDBConfig: {
                    username: peer.couchdbUser,
                    password: peer.couchdbSecret,
                    couchDBAddress: `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-2-${DeploymentStage.COUCHDB}:5984`, // Hardcoding since it is using internal network
                  },
                })
                .setVMOptions({
                  docker: {
                    hostConfig: {
                      NetworkMode: `${InfrastructureEnvironment.orgName}_network`,
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
                `Peer-2 configuration generated successfully for organization ${InfrastructureEnvironment.orgName}.`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(
                `Failed to generate Peer-2 configuration.`,
                e as Error
              );
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-44 Create NodeOU config files and populate the volumes", async () => {
            try {
              const peerContainerName = `${InfrastructureEnvironment.orgName}-peer-2`;

              if (await orchestrator.isContainerRunning(peerContainerName)) {
                logger.info(
                  `Peer container ${peerContainerName} is already running. Skipping NodeOU configuration generation.`
                );
                return;
              }

              logger.info(
                `Generating NodeOU configuration for peer-2 MSP (org: ${InfrastructureEnvironment.orgName}).`
              );

              const basePeerPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
                DeploymentStage.CA,
                "client",
                "peers"
              );

              const peerFolder = path.join(
                basePeerPath,
                "peer-2",
                DeploymentStage.CA
              );

              const mspPath = path.join(peerFolder, "msp");

              fs.mkdirSync(mspPath, { recursive: true });

              const nodeOU = {
                NodeOUs: {
                  Enable: true,
                  ClientOUIdentifier: {
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                    OrganizationalUnitIdentifier: FabricAccountType.CLIENT,
                  },
                  AdminOUIdentifier: {
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
                    OrganizationalUnitIdentifier: FabricAccountType.ADMIN,
                  },
                  PeerOUIdentifier: {
                    Certificate: `intermediatecerts/${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}-${InfrastructureEnvironment.ca.port}.pem`,
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
                `Failed to generate NodeOU configuration for peer-2 MSP.`,
                e as Error
              );
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-45 Populates Peer Volume", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-2`;
              const caContainerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Peer-2 container ${containerName} is already running. Skipping peer volume population.`
                );
                return;
              }

              const basePeerPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName,
                DeploymentStage.CA,
                "client",
                "peers"
              );

              const peerFolder = path.join(
                basePeerPath,
                "peer-2",
                DeploymentStage.CA
              );

              const mspPath = path.join(peerFolder, "msp/config.yaml");

              const peerPath = path.join(peerFolder, "core.yaml");

              logger.info(
                `Populating Peer-2 volume in CA container ${caContainerName} with MSP and peer configuration.`
              );

              await orchestrator.copyToAndFromContainer(
                caContainerName,
                mspPath,
                "/etc/hyperledger/client/peers/peer-2/ca/msp/config.yaml"
              );

              logger.info(
                `Copied peer-2 MSP config.yaml to CA container ${caContainerName}.`
              );

              await orchestrator.copyToAndFromContainer(
                caContainerName,
                peerPath,
                "/etc/hyperledger/client/peers/peer-2/ca/core.yaml"
              );

              logger.info(
                `Copied peer-2 core.yaml to CA container ${caContainerName}.`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(`Failed to populate Peer-2 volume.`, e as Error);
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-46 Starts Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-2`;

              if (await orchestrator.isContainerRunning(containerName)) {
                logger.info(
                  `Peer-2 container ${containerName} is already running. Skipping startup.`
                );
                return;
              }

              logger.info(
                `Starting Peer-2 service for organization ${InfrastructureEnvironment.orgName} (container: ${containerName}).`
              );

              const env = Object.assign({}, process.env, baseEnv, {
                IMAGE: InfrastructureEnvironment.peer2.image,
                OPERATIONS_ADDRESS:
                  InfrastructureEnvironment.peer2.operationsAddress,
                PORT: InfrastructureEnvironment.peer2.port,
              });

              // Start Orderer service
              await orchestrator.serviceUp(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.PEER}-2`,
                dockerComposePath,
                { env }
              );

              logger.info(
                `Peer-2 container ${containerName} started. Waiting for readiness.`
              );

              await orchestrator.awaitContainerReadiness(containerName);

              logger.info(
                `Peer-2 container ${containerName} is healthy and ready.`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(`Failed to start Peer-2 container.`, e as Error);
              expect(e).toBeUndefined();
              return;
            }
          });

          it("STEP-47 Generates Peer TLS Cert For Client", async () => {
            try {
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-2`;

              const localPath = path.join(
                __dirname,
                STORAGE_DIR_NAME,
                InfrastructureEnvironment.orgName
              );

              const intPem = path.join(localPath, "peer-2-int.pem");
              const rootPem = path.join(localPath, "peer-2-root.pem");
              const chainPem = path.join(localPath, "peer-2-tls.pem");

              await orchestrator.copyToAndFromContainer(
                containerName,
                `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${InfrastructureEnvironment.orgName}-tls-${InfrastructureEnvironment.tls.port}.pem`,
                intPem,
                "from"
              );

              await orchestrator.copyToAndFromContainer(
                containerName,
                `/etc/hyperledger/fabric/tls/msp/tlscacerts/tls-${InfrastructureEnvironment.orgName}-tls-${InfrastructureEnvironment.tls.port}.pem`,
                rootPem,
                "from"
              );

              execSync(`cat ${intPem} ${rootPem} > ${chainPem}`);

              await orchestrator.copyToAndFromContainer(
                containerName,
                chainPem,
                `/etc/hyperledger/shared/peer-2-tls.pem`
              );
            } catch (e: unknown) {
              err = e;
              logger.error(`Failed to Peer-2 TLS Cert.`, e as Error);
              expect(e).toBeUndefined();
              return;
            }
          });
        });
      });

      describe("Channel", () => {
        let peerJoinedChannel = false;

        it("STEP-48 Creates Channel Configuration (configtx.yaml)", async () => {
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

            const channel = InfrastructureEnvironment.channel;

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
              CHANNEL_PROFILE: channel.profile,
              ON_PREM_CHANNEL_PROFILE:
                InfrastructureEnvironment.onPremChannel.profile,
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
            logger.error(
              `Failed to generate or copy configtx.yaml.`,
              e as Error
            );
            expect(e).toBeUndefined();
            return;
          }
        });

        it("STEP-49 Creates Genesis Block", async () => {
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
                `Channel "${InfrastructureEnvironment.channel.name}" already exists. Skipping genesis block generation.`
              );
              return;
            }

            const channel = InfrastructureEnvironment.channel;

            logger.info(
              `Generating genesis block for channel "${channel.name}" using profile "${channel.profile}" (container: ${containerName}).`
            );

            const builder = new ConfigtxgenCommandBuilder();

            const cmd = builder
              .setConfigPath(`/weaver/tools`)
              .setProfile(channel.profile)
              .setChannelID(channel.name)
              .setOutputBlock(`/weaver/tools/genesis_block.pb`)
              .build();

            logger.debug(`Executing configtxgen in ${containerName}: ${cmd}`);

            await orchestrator.executeInContainer(
              containerName,
              cmd.split(" ")
            );

            logger.info(
              `Genesis block generated successfully at /weaver/tools/genesis_block.pb (container: ${containerName}).`
            );
          } catch (e: unknown) {
            err = e;
            logger.error(`Failed to generate genesis block.`, e as Error);
            expect(e).toBeUndefined();
            return;
          }
        });

        it("STEP-50 Copy Genesis BLock to Orderers", async () => {
          try {
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

            if (!(await orchestrator.isContainerRunning(containerName))) {
              logger.info(
                `Tools container ${containerName} is not running. Skipping genesis block copy to orderers.`
              );
              return;
            }

            const channel = InfrastructureEnvironment.channel;

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

            const genesisBlockPath = `/weaver/tools/genesis_block.pb`;

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
            logger.error(
              `Failed to copy genesis block to orderers.`,
              e as Error
            );
            expect(e).toBeUndefined();
            return;
          }
        });

        it("STEP-51 Joins Orderers to the channel", async () => {
          try {
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

            if (!(await orchestrator.isContainerRunning(containerName))) {
              logger.info(
                `Tools container ${containerName} is not running. Skipping orderer channel join.`
              );
              return;
            }

            const channel = InfrastructureEnvironment.channel;

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
              .setConfigBlock(`/weaver/orderers/orderer-0/genesis_block.pb`)
              .setCAFile("/weaver/shared/tls-cert.pem")
              .setClientCert(
                `/weaver/orderers/orderer-0/tls/msp/signcerts/cert.pem`
              )
              .setClientKey(
                `/weaver/orderers/orderer-0/tls/msp/keystore/key.pem`
              )
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
              .setConfigBlock(`/weaver/orderers/orderer-1/genesis_block.pb`)
              .setCAFile("/weaver/shared/tls-cert.pem")
              .setClientCert(
                `/weaver/orderers/orderer-1/tls/msp/signcerts/cert.pem`
              )
              .setClientKey(
                `/weaver/orderers/orderer-1/tls/msp/keystore/key.pem`
              )
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
              .setConfigBlock(`/weaver/orderers/orderer-2/genesis_block.pb`)
              .setCAFile("/weaver/shared/tls-cert.pem")
              .setClientCert(
                `/weaver/orderers/orderer-2/tls/msp/signcerts/cert.pem`
              )
              .setClientKey(
                `/weaver/orderers/orderer-2/tls/msp/keystore/key.pem`
              )
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
            logger.error(
              `Failed to copy genesis block to orderers.`,
              e as Error
            );
            expect(e).toBeUndefined();
            return;
          }
        });

        it("STEP-52 Joins peers to the channel", async () => {
          try {
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

            if (!(await orchestrator.isContainerRunning(containerName))) {
              logger.info(
                `Tools container ${containerName} is not running. Skipping peer channel join.`
              );
              return;
            }

            const channel = InfrastructureEnvironment.channel;

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
              .setDestination("/etc/hyperledger/fabric/genesis_block.pb")
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
              .setBlockPath("/etc/hyperledger/fabric/genesis_block.pb")
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
              .setDestination("/etc/hyperledger/fabric/genesis_block.pb")
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
              .setBlockPath("/etc/hyperledger/fabric/genesis_block.pb")
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
              .setDestination("/etc/hyperledger/fabric/genesis_block.pb")
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
              .setBlockPath("/etc/hyperledger/fabric/genesis_block.pb")
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
            logger.error(
              `Failed to copy genesis block to orderers.`,
              e as Error
            );
            expect(e).toBeUndefined();
            return;
          }
        });
      });

      describe("Idle container stop", () => {
        it("STEP-53 Stops tools service", async () => {
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
  });

  describe("Build Contract", () => {
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

          // The contract is generated locally from the for-fabric repository models.
          // Indexes are resolved from the local folder, mirroring ptp-workspace's
          // approach of generating indexes from the toolkit dependency.
          const fabricCliFile = path.resolve(
            __dirname,
            "../../../lib/cjs/bin/cli.cjs"
          );

          const repoRoot = path.resolve(__dirname, "../../..");
          const outDir = `./deployment/tests/infrastructure/${STORAGE_DIR_NAME}/${InfrastructureEnvironment.orgName}/contracts`;

          logger.info(
            `Generating contract indexes from local for-fabric models into ${contractsLocalFolder}.`
          );

          execSync(
            `LEVEL=verbose node ${fabricCliFile} extract-indexes --folder ./lib/cjs/contract/trackedModels --outDir ${outDir}`,
            {
              stdio: "inherit",
              cwd: repoRoot,
            }
          );

          if (InfrastructureEnvironment.enableCollections) {
            const mspIds = JSON.stringify(
              InfrastructureEnvironment.participatingOrgs
                .split(",")
                .map((org: string) => generateMspId(org.toLowerCase()))
              // eslint-disable-next-line no-useless-escape
            ).replace(/"/g, '\"');

            logger.info(
              `Executing command to generate collections for: ${mspIds}`
            );

            execSync(
              `LEVEL=verbose node ${fabricCliFile} extract-collections --folder ./lib/cjs/contract/trackedModels --outDir ${outDir} --mspIds '${mspIds}' --mainMspId ${generateMspId(InfrastructureEnvironment.orgName.toLowerCase())}`,
              {
                stdio: "inherit",
                cwd: repoRoot,
              }
            );
          }

          if (!fs.existsSync(toolkitMetaInfFolder)) {
            throw new Error(
              `Contract bundle does not contain a META-INF folder (${toolkitMetaInfFolder}). Check the local contract generation.`
            );
          }

          const containerPath = `/weaver/contract/${InfrastructureEnvironment.contract.name}`;

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
            `/weaver/contract/${InfrastructureEnvironment.contract.name}/META-INF`
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

  describe("Deploy Contract", () => {
    describe("SIMPLE-XXX - Deploy Contract", () => {
      let peerInstalledContract = false;
      const onPrem = InfrastructureEnvironment.onPrem || false;
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
              line.includes(InfrastructureEnvironment.contract.name)
            );

          if (peerInstalledContract) {
            logger.info("Exiting");
            return;
          }

          const chaincode = InfrastructureEnvironment.contract;

          const basePath = path.join(
            __dirname,
            STORAGE_DIR_NAME,
            InfrastructureEnvironment.orgName,
            `contracts/${InfrastructureEnvironment.contract.name}`
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
            `/weaver/contract/${InfrastructureEnvironment.contract.name}/META-INF`,
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
            `/weaver/contract/${InfrastructureEnvironment.contract.name}/${chaincode.name}_ccaas.tar.gz`
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

          const chaincode = InfrastructureEnvironment.contract;

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
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CCAAS}-${InfrastructureEnvironment.contract.name}`;

          if (await orchestrator.isContainerRunning(containerName)) {
            logger.info(`${containerName} is already running running.`);
            return;
          }

          const chaincode = InfrastructureEnvironment.contract;

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
            onPrem
              ? `${DeploymentStage.CCAAS}-${DeploymentStage.ON_PREM}`
              : `${DeploymentStage.CCAAS}`,
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
            .setChannelID(InfrastructureEnvironment.channel.name)
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
            .setVersion(InfrastructureEnvironment.contract.version)
            .setSequence(sequence.toString())
            .enableTLS(true)
            .setTLSCAFile(`/etc/hyperledger/shared/tls-cert.pem`)
            .setContractName(InfrastructureEnvironment.contract.name)
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
              .setChannelID(InfrastructureEnvironment.channel.name)
              .setContractName(InfrastructureEnvironment.contract.name)
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
            .setChannelID(InfrastructureEnvironment.channel.name)
            .setContractName(InfrastructureEnvironment.contract.name)
            .setVersion(InfrastructureEnvironment.contract.version)
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

  describe("Update Contract", () => {
    describe("SIMPLE-XXX - Update Contract", () => {
      let sequence = 1;
      let oldContracts: string[] = [];
      let currentId: string = "";
      const onPrem = InfrastructureEnvironment.onPrem || false;

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

      it("STEP-2 Shutdown old Contract CaaS Service", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CCAAS}-${InfrastructureEnvironment.contract.name}`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is already running running.`);
            return;
          }

          const chaincode = InfrastructureEnvironment.contract;

          // Prepare environment
          const env = Object.assign({}, process.env, baseEnv, {
            PACKAGE_ID: "",
            CONTRACT_NAME: chaincode.name,
            PORT: chaincode.port,
            IMAGE: chaincode.image,
          });

          await orchestrator.serviceDown(
            InfrastructureEnvironment.orgName,
            onPrem
              ? `${DeploymentStage.CCAAS}-${DeploymentStage.ON_PREM}`
              : `${DeploymentStage.CCAAS}`,
            dockerComposePath,
            { env }
          );
        } catch (e: unknown) {
          err = e;
          logger.error("Failed to shutdown contract container", e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });

      it("STEP-3 Queries Contract Sequence", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`;
          const toolsContainerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is not running.`);
            return;
          }

          const builder = new FabricPeerLifecycleChaincodeCommandBuilder();
          const command = builder
            .setCommand(PeerLifecycleChaincodeCommands.QUERYCOMMITTED)
            .setChannelID(InfrastructureEnvironment.channel.name)
            .setContractName(InfrastructureEnvironment.contract.name)
            .setContractName(InfrastructureEnvironment.contract.name)
            .build();

          const output = await orchestrator.exec(containerName, command, [
            `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
          ]);

          const match = output.toString().match(/Sequence:\s*(\d+)/);
          const seq = match ? Number(match[1]) : 0;

          sequence = seq + 1;

          //save sequence

          const p = path.join(__dirname, "./sequence.txt");

          fs.writeFileSync(p, sequence.toString(), "utf-8");

          await orchestrator.copyToAndFromContainer(
            toolsContainerName,
            p,
            `/weaver/contract/${InfrastructureEnvironment.contract.name}/META-INF/sequence.txt`
          );

          await orchestrator.exec(
            toolsContainerName,
            `cd ./weaver/contract/${InfrastructureEnvironment.contract.name} && tar -czf ${InfrastructureEnvironment.contract.name}.tar.gz META-INF/`,
            []
          );
        } catch (e: unknown) {
          err = e;
          logger.error("Failed to query contract sequence", e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });

      it("STEP-4 Creates Installation Package", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is not running running.`);
            return;
          }

          const chaincode = InfrastructureEnvironment.contract;

          const basePath = path.join(
            __dirname,
            STORAGE_DIR_NAME,
            InfrastructureEnvironment.orgName,
            `contracts/${InfrastructureEnvironment.contract.name}`
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
            `/weaver/contract/${InfrastructureEnvironment.contract.name}/META-INF`,
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

          // fs.mkdirSync(path.join(basePath, "metadata"), {
          //   recursive: true,
          // });

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

          await orchestrator.copyToAndFromContainer(
            containerName,
            path.join(basePath, `${chaincode.name}_ccaas.tar.gz`),
            `/weaver/contract/${InfrastructureEnvironment.contract.name}/${chaincode.name}_ccaas.tar.gz`
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

      it("STEP-5 Caches previous installed", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`;

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

      it("STEP-6 Installs contract on peers", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is not running running.`);
            return;
          }

          const chaincode = InfrastructureEnvironment.contract;

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

      it("STEP-7 Start Contract CaaS Service", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CCAAS}-${InfrastructureEnvironment.contract.name}`;

          if (await orchestrator.isContainerRunning(containerName)) {
            logger.info(`${containerName} is already running running.`);
            return;
          }

          const chaincode = InfrastructureEnvironment.contract;

          const container = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`;

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
          const env = Object.assign({}, process.env, baseEnv, {
            PACKAGE_ID: packageID,
            CONTRACT_NAME: chaincode.name,
            PORT: chaincode.port,
            IMAGE: chaincode.image,
            // CORE_PEER_LOCALMSPID: generateMspId(
            //   InfrastructureEnvironment.orgName.toLowerCase()
            // ),
          });

          await orchestrator.serviceUp(
            InfrastructureEnvironment.orgName,
            onPrem
              ? `${DeploymentStage.CCAAS}-${DeploymentStage.ON_PREM}`
              : `${DeploymentStage.CCAAS}`,
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

      it("STEP-8 Approves Contract", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is not running running.`);
            return;
          }

          //TODO: Find some exit condition

          let builder = new FabricPeerLifecycleChaincodeCommandBuilder();

          const id = currentId;

          builder = new FabricPeerLifecycleChaincodeCommandBuilder();

          const command = builder
            .setCommand(PeerLifecycleChaincodeCommands.APPROVEFORMYORG)
            .setChannelID(InfrastructureEnvironment.channel.name)
            .setOrdererAddress(
              `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-0:${InfrastructureEnvironment.orderer0.port}`
            )
            .setPackageID(id)
            .setVersion(InfrastructureEnvironment.contract.version)
            .setSequence(sequence.toString())
            .enableTLS(true)
            .setTLSCAFile(`/etc/hyperledger/shared/tls-cert.pem`)
            .setContractName(InfrastructureEnvironment.contract.name)
            .setCollectionsConfigPath(
              InfrastructureEnvironment.enableCollections
                ? `/etc/hyperledger/contract/${InfrastructureEnvironment.contract.name}/META-INF/collections_config.json`
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

      it("STEP-9 Commits Contract", async () => {
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
              .setChannelID(InfrastructureEnvironment.channel.name)
              .setContractName(InfrastructureEnvironment.contract.name)
              .setVersion(InfrastructureEnvironment.contract.version)
              .setSequence(sequence.toString())
              .enableTLS(true)
              .setTLSCAFile(`/etc/hyperledger/shared/tls-cert.pem`)
              .setCollectionsConfigPath(
                InfrastructureEnvironment.enableCollections
                  ? `/etc/hyperledger/contract/${InfrastructureEnvironment.contract.name}/META-INF/collections_config.json`
                  : undefined
              )
              .setOutput("json")
              .build();

            const res = await orchestrator.executeInContainer(
              container,
              cmd.split(" ")
            );

            const approvalJSON = JSON.parse(
              res.stdout.toString().replace(/[^\x20-\x7E]+/g, "")
            );

            // const hasApproval =
            // Object.keys(approvalJSON.approvals).filter(
            //   (key) => approvalJSON.approvals[key] == true
            // ).length >
            //   Object.keys(approvalJSON.approvals).length / 2;

            const hasApproval = Object.keys(approvalJSON.approvals).some(
              (key) =>
                approvalJSON.approvals[key] == true &&
                key == generateMspId(InfrastructureEnvironment.orgName)
            );

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
            .setChannelID(InfrastructureEnvironment.channel.name)
            .setContractName(InfrastructureEnvironment.contract.name)
            .setVersion(InfrastructureEnvironment.contract.version)
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
            .setCollectionsConfigPath(
              InfrastructureEnvironment.enableCollections
                ? `/etc/hyperledger/contract/${InfrastructureEnvironment.contract.name}/META-INF/collections_config.json`
                : undefined
            )
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

      it("STEP-10 Stop Tools service", async () => {
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

  describe("Update Image Contract", () => {
    describe("SIMPLE-XXX - Update Contract", () => {
      let currentId: string = "";
      const onPrem = InfrastructureEnvironment.onPrem || false;

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

      it("STEP-2 Shutdown old Contract CaaS Service", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CCAAS}-${InfrastructureEnvironment.contract.name}`;

          if (!(await orchestrator.isContainerRunning(containerName))) {
            logger.info(`${containerName} is already running running.`);
            return;
          }

          const res = await orchestrator.getEnv(containerName, "env", [
            `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
          ]);

          res
            .toString()
            .split("\n")
            .forEach((line: string) => {
              if (line.startsWith("CHAINCODE_ID=")) {
                currentId = line.split("=")[1].trim();
              }
            });

          const chaincode = InfrastructureEnvironment.contract;

          // Prepare environment
          const env = Object.assign({}, process.env, baseEnv, {
            PACKAGE_ID: "",
            CONTRACT_NAME: chaincode.name,
            PORT: chaincode.port,
            IMAGE: chaincode.image,
          });

          await orchestrator.serviceDown(
            InfrastructureEnvironment.orgName,
            onPrem
              ? `${DeploymentStage.CCAAS}-${DeploymentStage.ON_PREM}`
              : `${DeploymentStage.CCAAS}`,
            dockerComposePath,
            { env }
          );
        } catch (e: unknown) {
          err = e;
          logger.error("Failed to shutdown contract container", e as Error);
          expect(e).toBeUndefined();
          return;
        }
      });

      it("STEP-7 Start Contract CaaS Service", async () => {
        try {
          // Resolve container name
          const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CCAAS}-${InfrastructureEnvironment.contract.name}`;

          if (await orchestrator.isContainerRunning(containerName)) {
            logger.info(`${containerName} is already running running.`);
            return;
          }

          const chaincode = InfrastructureEnvironment.contract;

          if (!currentId) throw new Error("Unable to extract currentId");

          const packageID = currentId;

          // Prepare environment
          const env = Object.assign({}, process.env, baseEnv, {
            PACKAGE_ID: packageID,
            CONTRACT_NAME: chaincode.name,
            PORT: chaincode.port,
            IMAGE: chaincode.image,
            // CORE_PEER_LOCALMSPID: generateMspId(
            //   InfrastructureEnvironment.orgName.toLowerCase()
            // ),
          });

          await orchestrator.serviceUp(
            InfrastructureEnvironment.orgName,
            onPrem
              ? `${DeploymentStage.CCAAS}-${DeploymentStage.ON_PREM}`
              : `${DeploymentStage.CCAAS}`,
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

      it("STEP-10 Stop Tools service", async () => {
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

  describe("Shutdown Infrastructure", () => {
    describe("SIMPLE-XXX - Shutdown Infrastructure", () => {
      describe("Shutdown Contract containers", () => {
        it("STEP-1 Stop Contract CaaS Service", async () => {
          try {
            // Resolve container name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CCAAS}-${InfrastructureEnvironment.contract.name}`;

            if (!(await orchestrator.isContainerRunning(containerName))) {
              logger.info(`${containerName} is already stopped.`);
              return;
            }

            const chaincode = InfrastructureEnvironment.contract;

            // Prepare environment
            const env = Object.assign({}, process.env, baseEnv, {
              PACKAGE_ID: "",
              CONTRACT_NAME: chaincode.name,
              PORT: chaincode.port,
              IMAGE: chaincode.image,
            });

            await orchestrator.serviceDown(
              InfrastructureEnvironment.orgName,
              `${DeploymentStage.CCAAS}`,
              dockerComposePath,
              { env }
            );
          } catch (e: unknown) {
            err = e;
            logger.error("Failed to stop contract container", e as Error);
            expect(e).toBeUndefined();
            return;
          }
        });

        it("STEP-2 Stop Contract CaaS on prem Service", async () => {
          try {
            // Resolve container name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CCAAS}-${InfrastructureEnvironment.onPremContract.name}`;

            if (!(await orchestrator.isContainerRunning(containerName))) {
              logger.info(`${containerName} is already stopped.`);
              return;
            }

            const chaincode = InfrastructureEnvironment.onPremContract;

            // Prepare environment
            const env = Object.assign({}, process.env, baseEnv, {
              PACKAGE_ID: "",
              CONTRACT_NAME: chaincode.name,
              PORT: chaincode.port,
              IMAGE: chaincode.image,
            });

            await orchestrator.serviceDown(
              InfrastructureEnvironment.orgName,
              `${DeploymentStage.CCAAS}-${DeploymentStage.ON_PREM}`,
              dockerComposePath,
              { env }
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
        describe("Peer-2", () => {
          it("STEP-2 Shutdown Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-2`;

              //Check if container is already running. Skipping if already running...
              if (!(await orchestrator.isContainerRunning(containerName))) {
                logger.info(
                  `Container: ${containerName} already running. Skipping deployment...`
                );
                return;
              }

              logger.info(
                `Starting ${InfrastructureEnvironment.orgName} Peer as ${containerName}`
              );

              const env = Object.assign({}, process.env, baseEnv, {
                IMAGE: InfrastructureEnvironment.peer2.image,
                OPERATIONS_ADDRESS:
                  InfrastructureEnvironment.peer2.operationsAddress,
                PORT: InfrastructureEnvironment.peer2.port,
              });

              // Start Orderer service
              await orchestrator.serviceDown(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.PEER}-2`,
                dockerComposePath,
                { env }
              );

              logger.info(
                `Booting ${InfrastructureEnvironment.orgName} CA as ${containerName}`
              );

              logger.info(`Peer Deployed Successfully.`);
            } catch (e: unknown) {
              err = e;
              expect(e).toBeUndefined();
              return;
            }
          });
          it("STEP-3 Shutdown DB Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-2-${DeploymentStage.COUCHDB}`;

              //Check if container is already running. Skipping if already running...
              if (!(await orchestrator.isContainerRunning(containerName))) {
                logger.info(
                  `Container: ${containerName} not running. Skipping shutdown...`
                );
                return;
              }

              logger.info(
                `Starting ${InfrastructureEnvironment.orgName} peer couchdb as ${containerName}`
              );

              const env = Object.assign({}, process.env, baseEnv, {
                COUCHDB_IMAGE: InfrastructureEnvironment.peer2.couchdbImage,
                COUCHDB_USER: InfrastructureEnvironment.peer2.couchdbUser,
                COUCHDB_SECRET: InfrastructureEnvironment.peer2.couchdbSecret,
                ORG_NAME: InfrastructureEnvironment.orgName,
                COUCHDB_PORT: InfrastructureEnvironment.peer2.couchdbPort,
              });

              // Start Orderer service
              await orchestrator.serviceDown(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.PEER}-2-${DeploymentStage.COUCHDB}`,
                dockerComposePath,
                { env }
              );

              logger.info(
                `Shutting down ${InfrastructureEnvironment.orgName} CouchDB for peer as ${containerName}`
              );

              logger.info(`Peer CouchDB shutdown Successfully.`);
            } catch (e: unknown) {
              err = e;
              expect(e).toBeUndefined();
              return;
            }
          });
        });

        describe("Peer-1", () => {
          it("STEP-4 Shutdown Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-1`;

              //Check if container is already running. Skipping if already running...
              if (!(await orchestrator.isContainerRunning(containerName))) {
                logger.info(
                  `Container: ${containerName} already running. Skipping deployment...`
                );
                return;
              }

              logger.info(
                `Starting ${InfrastructureEnvironment.orgName} Peer as ${containerName}`
              );

              const env = Object.assign({}, process.env, baseEnv, {
                IMAGE: InfrastructureEnvironment.peer1.image,
                OPERATIONS_ADDRESS:
                  InfrastructureEnvironment.peer1.operationsAddress,
                PORT: InfrastructureEnvironment.peer1.port,
              });

              // Start Orderer service
              await orchestrator.serviceDown(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.PEER}-1`,
                dockerComposePath,
                { env }
              );

              logger.info(
                `Booting ${InfrastructureEnvironment.orgName} CA as ${containerName}`
              );

              logger.info(`Peer Deployed Successfully.`);
            } catch (e: unknown) {
              err = e;
              expect(e).toBeUndefined();
              return;
            }
          });
          it("STEP-5 Shutdown DB Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-1-${DeploymentStage.COUCHDB}`;

              //Check if container is already running. Skipping if already running...
              if (!(await orchestrator.isContainerRunning(containerName))) {
                logger.info(
                  `Container: ${containerName} not running. Skipping shutdown...`
                );
                return;
              }

              logger.info(
                `Starting ${InfrastructureEnvironment.orgName} peer couchdb as ${containerName}`
              );

              const env = Object.assign({}, process.env, baseEnv, {
                COUCHDB_IMAGE: InfrastructureEnvironment.peer1.couchdbImage,
                COUCHDB_USER: InfrastructureEnvironment.peer1.couchdbUser,
                COUCHDB_SECRET: InfrastructureEnvironment.peer1.couchdbSecret,
                ORG_NAME: InfrastructureEnvironment.orgName,
                COUCHDB_PORT: InfrastructureEnvironment.peer1.couchdbPort,
              });

              // Start Orderer service
              await orchestrator.serviceDown(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.PEER}-1-${DeploymentStage.COUCHDB}`,
                dockerComposePath,
                { env }
              );

              logger.info(
                `Shutting down ${InfrastructureEnvironment.orgName} CouchDB for peer as ${containerName}`
              );

              logger.info(`Peer CouchDB shutdown Successfully.`);
            } catch (e: unknown) {
              err = e;
              expect(e).toBeUndefined();
              return;
            }
          });
        });

        describe("Peer-0", () => {
          it("STEP-6 Shutdown Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`;

              //Check if container is already running. Skipping if already running...
              if (!(await orchestrator.isContainerRunning(containerName))) {
                logger.info(
                  `Container: ${containerName} already running. Skipping deployment...`
                );
                return;
              }

              logger.info(
                `Starting ${InfrastructureEnvironment.orgName} Peer as ${containerName}`
              );

              const env = Object.assign({}, process.env, baseEnv, {
                IMAGE: InfrastructureEnvironment.peer0.image,
                OPERATIONS_ADDRESS:
                  InfrastructureEnvironment.peer0.operationsAddress,
                PORT: InfrastructureEnvironment.peer0.port,
              });

              // Start Orderer service
              await orchestrator.serviceDown(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.PEER}-0`,
                dockerComposePath,
                { env }
              );

              logger.info(
                `Booting ${InfrastructureEnvironment.orgName} CA as ${containerName}`
              );

              logger.info(`Peer Deployed Successfully.`);
            } catch (e: unknown) {
              err = e;
              expect(e).toBeUndefined();
              return;
            }
          });
          it("STEP-7 Shutdown DB Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0-${DeploymentStage.COUCHDB}`;

              //Check if container is already running. Skipping if already running...
              if (!(await orchestrator.isContainerRunning(containerName))) {
                logger.info(
                  `Container: ${containerName} not running. Skipping shutdown...`
                );
                return;
              }

              logger.info(
                `Starting ${InfrastructureEnvironment.orgName} peer couchdb as ${containerName}`
              );

              const env = Object.assign({}, process.env, baseEnv, {
                COUCHDB_IMAGE: InfrastructureEnvironment.peer0.couchdbImage,
                COUCHDB_USER: InfrastructureEnvironment.peer0.couchdbUser,
                COUCHDB_SECRET: InfrastructureEnvironment.peer0.couchdbSecret,
                ORG_NAME: InfrastructureEnvironment.orgName,
                COUCHDB_PORT: InfrastructureEnvironment.peer0.couchdbPort,
              });

              // Start Orderer service
              await orchestrator.serviceDown(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.PEER}-0-${DeploymentStage.COUCHDB}`,
                dockerComposePath,
                { env }
              );

              logger.info(
                `Shutting down ${InfrastructureEnvironment.orgName} CouchDB for peer as ${containerName}`
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

      describe("Shutdown Orderers containers", () => {
        describe("Orderer-0", () => {
          it("STEP-8 Stops Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-0`;

              //Check if container is already running. Skipping if already running...
              if (!(await orchestrator.isContainerRunning(containerName))) {
                logger.info(
                  `Container: ${containerName} already running. Skipping deployment...`
                );
                return;
              }

              const env = Object.assign({}, process.env, baseEnv, {
                IMAGE: InfrastructureEnvironment.orderer0.image,
                OPERATIONS_ADDRESS:
                  InfrastructureEnvironment.orderer0.operationsAddress,
                PORT: InfrastructureEnvironment.orderer0.port,
                OSN_PORT: InfrastructureEnvironment.orderer0.port,
              });

              // Start CA service
              await orchestrator.serviceDown(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.ORDERER}-0`,
                dockerComposePath,
                { env }
              );

              logger.info(
                `Shutdown ${InfrastructureEnvironment.orgName} orderer as ${containerName}`
              );
            } catch (e: unknown) {
              err = e;
              expect(e).toBeUndefined();
              return;
            }
          });
        });

        describe("Orderer-1", () => {
          it("STEP-9 Stops Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-1`;

              //Check if container is already running. Skipping if already running...
              if (!(await orchestrator.isContainerRunning(containerName))) {
                logger.info(
                  `Container: ${containerName} already running. Skipping deployment...`
                );
                return;
              }

              const env = Object.assign({}, process.env, baseEnv, {
                IMAGE: InfrastructureEnvironment.orderer1.image,
                OPERATIONS_ADDRESS:
                  InfrastructureEnvironment.orderer1.operationsAddress,
                PORT: InfrastructureEnvironment.orderer1.port,
                OSN_PORT: InfrastructureEnvironment.orderer1.port,
              });

              // Start CA service
              await orchestrator.serviceDown(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.ORDERER}-1`,
                dockerComposePath,
                { env }
              );

              logger.info(
                `Shutdown ${InfrastructureEnvironment.orgName} orderer as ${containerName}`
              );
            } catch (e: unknown) {
              err = e;
              expect(e).toBeUndefined();
              return;
            }
          });
        });

        describe("Orderer-2", () => {
          it("STEP-10 Stops Service", async () => {
            try {
              // Resolve container name
              const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-2`;

              //Check if container is already running. Skipping if already running...
              if (!(await orchestrator.isContainerRunning(containerName))) {
                logger.info(
                  `Container: ${containerName} already running. Skipping deployment...`
                );
                return;
              }

              const env = Object.assign({}, process.env, baseEnv, {
                IMAGE: InfrastructureEnvironment.orderer2.image,
                OPERATIONS_ADDRESS:
                  InfrastructureEnvironment.orderer2.operationsAddress,
                PORT: InfrastructureEnvironment.orderer2.port,
                OSN_PORT: InfrastructureEnvironment.orderer2.port,
              });

              // Start CA service
              await orchestrator.serviceDown(
                InfrastructureEnvironment.orgName,
                `${DeploymentStage.ORDERER}-2`,
                dockerComposePath,
                { env }
              );

              logger.info(
                `Shutdown ${InfrastructureEnvironment.orgName} orderer as ${containerName}`
              );
            } catch (e: unknown) {
              err = e;
              expect(e).toBeUndefined();
              return;
            }
          });
        });
      });

      describe("Shutdown CA Container", () => {
        it("STEP-11 Stops Service", async () => {
          try {
            // Resolve container name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.CA}`;
            //If the tools container is not up no point in doing shutdown again
            if (!(await orchestrator.isContainerRunning(containerName))) {
              logger.info(`The ca container has already been shut down.`);
              return;
            }

            logger.info(`Shutting down ${containerName}`);

            const env = Object.assign({}, process.env, baseEnv, {
              IMAGE: InfrastructureEnvironment.ca.image,
              OPERATIONS_ADDRESS:
                InfrastructureEnvironment.ca.operationsAddress,
            });

            await orchestrator.serviceDown(
              InfrastructureEnvironment.orgName,
              DeploymentStage.CA,
              dockerComposePath,
              { env }
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
        it("STEP-12 Stops Service", async () => {
          try {
            // Resolve container name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TLS}`;
            //If the tools container is not up no point in doing shutdown again
            if (!(await orchestrator.isContainerRunning(containerName))) {
              logger.info(`The tls container has already been shut down.`);
              return;
            }

            logger.info(`Shutting down ${containerName}`);

            const env = Object.assign({}, process.env, baseEnv, {
              IMAGE: InfrastructureEnvironment.tls.image,
              ORDERER_ADDRESS: InfrastructureEnvironment.tls.operationsAddress,
            });

            await orchestrator.serviceDown(
              InfrastructureEnvironment.orgName,
              DeploymentStage.TLS,
              dockerComposePath,
              { env }
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
        it("STEP-13 Stops Service", async () => {
          try {
            // Resolve container name
            const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;
            //If the tools container is not up no point in doing shutdown again
            if (!(await orchestrator.containerExists(containerName))) {
              logger.info(`The Tools container has already been shut down.`);
              return;
            }

            logger.info(`Shutting down ${containerName}`);

            const env = Object.assign({}, process.env, baseEnv, {
              IMAGE: InfrastructureEnvironment.tools.image,
            });

            await orchestrator.serviceDown(
              InfrastructureEnvironment.orgName,
              DeploymentStage.TOOLS,
              dockerComposePath,
              { env }
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
        it("STEP-14 Removes local folders", async () => {
          try {
            const dir = path.join(__dirname, STORAGE_DIR_NAME);

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

  describe("Fix Channel Block", () => {
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
    it("STEP-2 Fix block", async () => {
      try {
        // Resolve container name
        const containerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.PEER}-0`;
        const toolsContainerName = `${InfrastructureEnvironment.orgName}-${DeploymentStage.TOOLS}`;

        if (!(await orchestrator.isContainerRunning(containerName))) {
          logger.info(`${containerName} is not running.`);
          return;
        }

        const orderer = InfrastructureEnvironment.orderer0;

        await orchestrator.exec(containerName, "mkdir -p ./tmp/temp", []);

        let command = new FabricPeerChannelCommandBuilder()
          .setCommand(PeerChannelCommands.FETCH)
          .setBlockReference("config")
          .setDestination("./tmp/temp/config_block.pb")
          .setChannelID(InfrastructureEnvironment.channel.name)
          .setOrderer(
            `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-0:${orderer.port}`
          )
          .enableTLS(true)
          .setTLSCAFile(
            `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${InfrastructureEnvironment.orgName}-tls-${InfrastructureEnvironment.tls.port}.pem`
          )
          .build();

        logger.info(`Running command: ${command}`);

        await orchestrator.exec(containerName, command, [
          `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
        ]);

        command = new ConfigtxlatorCommandBuilder()
          .setCommand(ConfigtxlatorCommand.PROTO_DECODE)
          .setProtoOptions({
            input: "./tmp/temp/config_block.pb",
            type: ConfigtxlatorProtoMessage.BLOCK,
            output: "./tmp/temp/config_block.json",
          })
          .build();

        await orchestrator.executeInContainer(
          toolsContainerName,
          command.split(" ")
        );

        const filePath = "./config.json";
        const filePath1 = "./config_only.json";
        const outputFile1 = "./modified_peers_config.json";
        const outputFile2 = "./modified_config.json";
        const outputFile3 = "./modified_config_only.json";

        await orchestrator.copyToAndFromContainer(
          toolsContainerName,
          "./tmp/temp/config_block.json",
          filePath,
          "from"
        );

        let raw = fs.readFileSync(filePath, "utf-8");
        let config = JSON.parse(raw);

        const organizations: Record<string, FabricOrg> =
          config.data.data[0].payload.data.config.channel_group.groups
            .Application.groups;
        console.log("Anchor peers:");
        console.log("=".repeat(60));

        let totalAnchors = 0;

        for (const [orgName, orgConfig] of Object.entries(organizations)) {
          const anchorPeers =
            orgConfig.values?.AnchorPeers?.value?.anchor_peers ?? [];

          console.log(`\nOrganization: ${orgName}`);

          if (anchorPeers.length === 0) {
            console.log("  No anchor peers configured");
            continue;
          }

          for (const anchor of anchorPeers) {
            const oldPort = anchor.port;
            const oldHost = anchor.host;

            anchor.port = 443;
            anchor.host = `${anchor.host.split(".")[0]}.${InfrastructureEnvironment.orgDomain}`;
            totalAnchors++;

            console.log(
              `(old host: ${oldHost})\n(old port: ${oldPort})\nNew Anchor: ${anchor.host}:${anchor.port}`
            );
          }
        }

        console.log("\n" + "=".repeat(60));
        console.log(`Total anchor peers updated: ${totalAnchors}`);

        const ordererAddresses: string[] =
          config.data.data[0].payload.data.config.channel_group.values
            .OrdererAddresses.value.addresses;

        console.log("Orderer addresses:");
        console.log("=".repeat(60));

        fs.writeFileSync(outputFile1, JSON.stringify(config, null, 2));
        console.log(
          `Modified Anchor peers configuration written to: ${outputFile1}`
        );

        raw = fs.readFileSync(outputFile1, "utf-8");
        config = JSON.parse(raw);

        const updatedAddresses = ordererAddresses.map((address) => {
          const lastColonIndex = address.lastIndexOf(":");

          if (lastColonIndex === -1) {
            throw new Error(`Invalid orderer address: ${address}`);
          }

          const oldHost = address.substring(0, lastColonIndex);
          const oldPort = address.substring(lastColonIndex + 1);

          const updated = `${oldHost.split(".")[0]}.${InfrastructureEnvironment.orgDomain}:443`;

          console.log(
            `(old host: ${oldHost})\n(old port: ${oldPort})\n New Host: ${updated}`
          );

          return updated;
        });

        config.data.data[0].payload.data.config.channel_group.values.OrdererAddresses.value.addresses =
          updatedAddresses;

        console.log("=".repeat(60));
        console.log(`Total orderers updated: ${updatedAddresses.length}`);

        fs.writeFileSync(outputFile2, JSON.stringify(config, null, 2));
        console.log(`Modified configuration written to: ${outputFile2}`);
        execSync(
          `jq .data.data[0].payload.data.config ${outputFile2} > ${outputFile3}`
        );

        await orchestrator.copyToAndFromContainer(
          toolsContainerName,
          outputFile3,
          "./tmp/temp/modified_config_block.json",
          "to"
        );

        execSync(
          `jq .data.data[0].payload.data.config ${filePath} > ${filePath1}`
        );

        await orchestrator.copyToAndFromContainer(
          toolsContainerName,
          filePath1,
          "./tmp/temp/config.json",
          "to"
        );

        command = new ConfigtxlatorCommandBuilder()
          .setCommand(ConfigtxlatorCommand.PROTO_ENCODE)
          .setProtoOptions({
            input: "./tmp/temp/config.json",
            type: ConfigtxlatorProtoMessage.CONFIG,
            output: "./tmp/temp/config.pb",
          })
          .build();

        await orchestrator.executeInContainer(
          toolsContainerName,
          command.split(" ")
        );

        command = new ConfigtxlatorCommandBuilder()
          .setCommand(ConfigtxlatorCommand.PROTO_ENCODE)
          .setProtoOptions({
            input: "./tmp/temp/modified_config_block.json",
            type: ConfigtxlatorProtoMessage.CONFIG,
            output: "./tmp/temp/modified_config.pb",
          })
          .build();

        await orchestrator.executeInContainer(
          toolsContainerName,
          command.split(" ")
        );

        command = new ConfigtxlatorCommandBuilder()
          .setCommand(ConfigtxlatorCommand.COMPUTE_UPDATE)
          .setComputeUpdateOptions({
            channelId: InfrastructureEnvironment.channel.name,
            original: "./tmp/temp/config.pb",
            updated: "./tmp/temp/modified_config.pb",
            output: "./tmp/temp/hosts_update.pb",
          })
          .build();

        await orchestrator.executeInContainer(
          toolsContainerName,
          command.split(" ")
        );

        command = new ConfigtxlatorCommandBuilder()
          .setCommand(ConfigtxlatorCommand.PROTO_DECODE)
          .setProtoOptions({
            input: "./tmp/temp/hosts_update.pb",
            type: ConfigtxlatorProtoMessage.CONFIG_UPDATE,
            output: "./tmp/temp/hosts_update.json",
          })
          .build();

        await orchestrator.executeInContainer(
          toolsContainerName,
          command.split(" ")
        );

        command =
          `jq -n --arg channel_id "${InfrastructureEnvironment.channel.name}" --slurpfile cfg ./tmp/temp/hosts_update.json ` +
          // eslint-disable-next-line no-useless-escape
          `"{\\\"payload\\\":{\\\"header\\\":{\\\"channel_header\\\":{\\\"channel_id\\\":\\$channel_id,\\\"type\\\":2}},\\\"data\\\":{\\\"config_update\\\":\\$cfg[0]}}}" ` +
          `> ./tmp/temp/hosts_update_in_envelope.json`;

        await orchestrator.exec(toolsContainerName, command, []);

        command = new ConfigtxlatorCommandBuilder()
          .setCommand(ConfigtxlatorCommand.PROTO_ENCODE)
          .setProtoOptions({
            input: "./tmp/temp/hosts_update_in_envelope.json",
            type: ConfigtxlatorProtoMessage.ENVELOPE,
            output: "./tmp/temp/hosts_update_in_envelope.pb",
          })
          .build();

        await orchestrator.executeInContainer(
          toolsContainerName,
          command.split(" ")
        );

        await orchestrator.copyToAndFromContainer(
          toolsContainerName,
          `./tmp/temp/hosts_update_in_envelope.pb`,
          `./hosts_update_in_envelope.pb`,
          "from"
        );

        const orgNames = organizations;

        console.log(orgNames);
        for (const org in orgNames) {
          const orgName = org.toLowerCase();
          if (InfrastructureEnvironment.orgName === orgName) continue;

          const peerContainer = `${orgName}-${DeploymentStage.PEER}-0`;
          console.log(orgName);

          await orchestrator.exec(peerContainer, "mkdir -p ./tmp/temp", []);

          await orchestrator.copyToAndFromContainer(
            peerContainer,
            `./hosts_update_in_envelope.pb`,
            `./tmp/temp/hosts_update_in_envelope.pb`,
            "to"
          );

          command = new FabricPeerChannelCommandBuilder()
            .setCommand(PeerChannelCommands.SIGNCONFIGTX)
            .setFile(`./tmp/temp/hosts_update_in_envelope.pb`)
            .build();

          await orchestrator.exec(peerContainer, command, [
            `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
          ]);

          await orchestrator.copyToAndFromContainer(
            peerContainer,
            `./tmp/temp/hosts_update_in_envelope.pb`,
            `./hosts_update_in_envelope.pb`,
            "from"
          );

          command = `rm -rf /tmp/temp`;
          await orchestrator.exec(peerContainer, command, []);
        }

        await orchestrator.copyToAndFromContainer(
          containerName,
          `./hosts_update_in_envelope.pb`,
          `./tmp/temp/hosts_update_in_envelope.pb`,
          "to"
        );

        command = new FabricPeerChannelCommandBuilder()
          .setCommand(PeerChannelCommands.UPDATE)
          .setFile(`./tmp/temp/hosts_update_in_envelope.pb`)
          .setChannelID(InfrastructureEnvironment.channel.name)
          .setOrderer(
            `${InfrastructureEnvironment.orgName}-${DeploymentStage.ORDERER}-0:${orderer.port}`
          )
          .enableTLS(true)
          .setTLSCAFile(
            `/etc/hyperledger/fabric/tls/msp/tlsintermediatecerts/tls-${InfrastructureEnvironment.orgName}-tls-${InfrastructureEnvironment.tls.port}.pem`
          )
          .build();

        logger.info(`Running command: ${command}`);

        await orchestrator.exec(containerName, command, [
          `CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/admin/ca/msp`,
        ]);

        command = `rm -rf /tmp/temp`;
        await orchestrator.exec(toolsContainerName, command, []);
      } catch (e: unknown) {
        err = e;
        logger.error(`Failed to start Tools.`, e as Error);
        expect(e).toBeUndefined();
        return;
      }
    });
  });
});
