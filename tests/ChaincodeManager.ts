import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export class ChaincodeManager {
  rootPath: string;
  contractFolder: string;
  contractName: string;
  sequence: number;
  version: string;
  ordererAddress: string;
  channelName: string;
  peers: string[];

  constructor(options: {
    contractFolder: string;
    contractName: string;
    sequence?: number;
    version?: string;
    peers?: string[];
    ordererAddress?: string;
    channelName?: string;
    rootPath?: string;
  }) {
    this.contractFolder = options.contractFolder;
    this.contractName = options.contractName;
    this.sequence = options.sequence ?? 1;
    this.version = options.version ?? "1.0";
    this.peers = options.peers ?? [
      "org-a-peer-0",
      "org-b-peer-0",
      "org-c-peer-0",
    ];
    this.ordererAddress = options.ordererAddress ?? "org-a-orderer-0:7021";
    this.channelName = options.channelName ?? "simple-channel";
    this.rootPath = options.rootPath ?? process.cwd();
  }

  compile(copyBuildToDir: string = "") {
    console.log("[compile] Starting contract compilation...");

    const contractSourceFolder = path.join(
      this.rootPath,
      "tests",
      ".chaincode",
      "contracts",
      this.contractFolder
    );

    const targetContractBuildFolder = path.join(
      this.rootPath,
      "tests",
      ".chaincode",
      "build",
      this.contractFolder
    );

    console.log("[compile] Contract source folder:", contractSourceFolder);
    console.log("[compile] Target build folder:", targetContractBuildFolder);

    // Create necessary directories
    fs.mkdirSync(contractSourceFolder, { recursive: true });
    // remove build folder before build
    // fs.rmSync(targetContractBuildFolder, { recursive: true, force: true });
    fs.mkdirSync(targetContractBuildFolder, { recursive: true });

    const contractFile = path.join(contractSourceFolder, "index.ts");
    console.log("[compile] Running compiler...");

    // Execute Weaver compile command
    execSync(
      `npx weaver compile-contract -d \
            --contract-file ${contractFile} \
            --output-dir ${targetContractBuildFolder}`,
      { stdio: "inherit" }
    );

    // Copy important files
    console.log("[compile] Copying package.json and npm-shrinkwrap.json...");
    fs.copyFileSync(
      path.join(contractSourceFolder, "package.json"),
      path.join(targetContractBuildFolder, "package.json")
    );
    fs.copyFileSync(
      path.join(contractSourceFolder, "npm-shrinkwrap.json"),
      path.join(targetContractBuildFolder, "npm-shrinkwrap.json")
    );

    if (copyBuildToDir)
      fs.cpSync(
        targetContractBuildFolder,
        path.join(copyBuildToDir, this.contractFolder),
        { recursive: true, force: true }
      );
      const adapterConfigExportPath = path.join(
        targetContractBuildFolder,
        "..",
        "..",
        "adapter-config"
      );
      this.exportAdapterConfig(adapterConfigExportPath);
    }

    console.log("[compile] Process finished.");
    return this;
  }

  deploy() {
    try {
      for (const [i, peer] of this.peers.entries()) {
        const tlsCert = i === 0 ? "tls-ca-cert.pem" : "orderer-tls-ca-cert.pem";
        ChaincodeManager.deployContract(
          peer,
          this.contractFolder,
          this.contractName,
          tlsCert,
          this.ordererAddress,
          this.channelName,
          this.sequence,
          this.version
        );
      }
      console.info("[deploy] Contract deployment completed.");
    } catch (e: any) {
      throw e;
    }
    return this;
  }

  commit() {
    execSync(`docker exec org-a-peer-0 node ./weaver/lib/core/cli.cjs commit-chaincode -d -s \
            --orderer-address ${this.ordererAddress} \
            --channel-id ${this.channelName} \
            --chaincode-name ${this.contractName} \
            --chaincode-version ${this.version} \
            --sequence ${this.sequence} \
            --enable-tls \
            --tls-ca-cert-file /weaver/peer/tls-ca-cert.pem \
            --peer-addresses org-a-peer-0:7031,org-b-peer-0:7032,org-c-peer-0:7033 \
            --peer-root-tls ./weaver/peer/tls-ca-cert.pem,./weaver/peer/org-b-tls-ca-cert.pem,./weaver/peer/org-c-tls-ca-cert.pem
        `);
    return this;
  }

  invoke(functionName: string, args: any[], transient: any = {}) {
    // return invokeChaincode(
    //     this.contractName,
    //     functionName,
    //     args,
    //     transient
    // );
  }

  query(functionName: string, args: any[]) {
    // return queryChaincode(
    //     this.contractName,
    //     functionName,
    //     args
    // );
  }

  exportAdapterConfig(target: string): void {
    const peerConfig = {
      cryptoPath: path.resolve("./docker/infrastructure/docker-data"),
      keyCertOrDirectoryPath: path.resolve(
        "./docker/docker-data/admin/msp/keystore"
      ),
      certCertOrDirectoryPath: path.resolve(
        "./docker/docker-data/admin/msp/signcerts"
      ),
      tlsCert: path.resolve("./docker/docker-data/tls-ca-cert.pem"),
      peerEndpoint: "localhost:7031",
      peerHostAlias: "localhost",
      chaincodeName: this.contractName,
      ca: "org-a",
      mspId: "Peer0OrgaMSP",
      channel: this.channelName,
    };

    if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });

    const filePath = path.join(target, `${this.contractName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(peerConfig, null, 2), "utf8");
  }

  static deployContract(
    dockerName: string,
    contractFolder: string,
    contractName: string,
    tlsCert: string,
    ordererAddress: string,
    channelName: string,
    sequence: number = 1,
    version: string = "1.0"
  ): void {
    console.log("[deploy] Starting contract deployment on", dockerName);
    console.log("[deploy] Contract folder:", contractFolder);
    console.log("[deploy] Contract name:", contractName);

    // Package contract
    console.log("[deploy] Packaging chaincode...");
    execSync(
      `docker exec ${dockerName} \
        node ./weaver/lib/core/cli.cjs \
        package-chaincode -d \
        --chaincode-path ./weaver/chaincode/${contractFolder} \
        --lang node \
        --chaincode-output /weaver/peer/${contractName}.tar.gz \
        --chaincode-name ${contractName} \
        --chaincode-version ${version} -s
    `,
      { stdio: "inherit" }
    );
    console.log(`[deploy] Chaincode packaged successfully on ${dockerName}.`);

    // Install contract
    console.log("[deploy] Installing chaincode...");
    execSync(
      `docker exec ${dockerName} \
        node ./weaver/lib/core/cli.cjs install-chaincode -d -s \
        --chaincode-path ./weaver/peer/${contractName}.tar.gz`,
      { stdio: "inherit" }
    );
    console.log(`[deploy] Chaincode installed successfully on ${dockerName}.`);

    // Approve contract
    console.log("[deploy] Approving chaincode definition...");
    execSync(
      `docker exec ${dockerName} \
        node ./weaver/lib/core/cli.cjs approve-chaincode -d -s \
        --orderer-address ${ordererAddress} \
        --channel-id ${channelName} \
        --chaincode-name ${contractName} \
        --chaincode-version ${version} \
        --sequence ${sequence} \
        --enable-tls \
        --tls-ca-cert-file /weaver/peer/${tlsCert}
    `,
      { stdio: "inherit" }
    );
    console.log(`[deploy] Chaincode approved successfully on ${dockerName}.`);
  }
}
