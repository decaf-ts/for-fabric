import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { InternalError } from "@decaf-ts/db-decorators";
import ts from "typescript";

export function didInfrastructureBoot(
  containerName: string = "boot-org-c-peer-0"
): boolean {
  try {
    const output = execSync(
      `docker inspect ${containerName} --format='{{.State.ExitCode}}'`
    )
      .toString()
      .trim();

    return output === "0";
  } catch (err: any) {
    console.error("Error inspecting container:", err.message);
    return false;
  }
}

export async function ensureInfrastructureBooted(
  containerName: string = "boot-org-c-peer-0",
  timeout: number = 5000,
  attempts: number = 10
): Promise<void> {
  while (!didInfrastructureBoot(containerName)) {
    if (--attempts <= 0) throw new InternalError("exceeded allowed attempts");

    console.log("Waiting for infrastructure to boot...");
    await new Promise((r) => setTimeout(r, timeout)); // Wait for 5 seconds before retrying
  }
}

export function packageContract(
  dockerName: string,
  contractFolder: string,
  contractName: string,
  version: string = "1.0"
): void {
  execSync(`docker exec ${dockerName} node ./weaver/lib/core/cli.cjs package-chaincode -d \
    --chaincode-path ./weaver/chaincode/${contractFolder} \
    --lang node \
    --chaincode-output /weaver/peer/${contractName}.tar.gz \
    --chaincode-name ${contractName} \
    --chaincode-version ${version} -s
    `);
}

export function installContract(dockerName: string, contractName: string) {
  execSync(
    `docker exec ${dockerName} node ./weaver/lib/core/cli.cjs install-chaincode -d -s --chaincode-path ./weaver/peer/${contractName}.tar.gz`
  );
}

export function approveContract(
  dockerName: string,
  contractName: string,
  tlsCertName: string,
  sequence: number = 1,
  version: string = "1.0"
) {
  execSync(`docker exec ${dockerName} node ./weaver/lib/core/cli.cjs approve-chaincode -d -s \
    --orderer-address org-a-orderer-0:7021 \
    --channel-id simple-channel \
    --chaincode-name ${contractName} \
    --chaincode-version ${version} \
    --sequence ${sequence} \
    --enable-tls \
    --tls-ca-cert-file /weaver/peer/${tlsCertName}`);
}

export function deployContract(
  contractFolder: string,
  contractName: string,
  version: string = "1.0",
  peers: string[] = ["org-a-peer-0", "org-b-peer-0", "org-c-peer-0"]
) {
  let sequence: number;
  const countPath = path.resolve(
    path.join(
      `${__dirname}`,
      "..",
      "integration",
      "chaincodeTrackers",
      `${contractName}.count`
    )
  );
  try {
    sequence = parseInt(fs.readFileSync(countPath).toString("utf-8"));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e: unknown) {
    sequence = 1;
  }
  fs.writeFileSync(countPath, sequence.toString());

  try {
    for (const peer of peers) {
      packageContract(peer, contractFolder, contractName, version);
      installContract(peer, contractName);
      approveContract(
        peer,
        contractName,
        peer === "org-a-peer-0" ? "tls-ca-cert.pem" : "orderer-tls-ca-cert.pem",
        sequence,
        version
      );
    }
  } catch (err: any) {
    console.log("Error deploying contract:", err.message);
  }
}

export function commitChaincode(
  contractName: string,
  sequence: number = 1,
  version: string = "1.0"
): void {
  execSync(`docker exec org-a-peer-0 node ./weaver/lib/core/cli.cjs commit-chaincode -d -s \
    --orderer-address org-a-orderer-0:7021 \
    --channel-id simple-channel \
    --chaincode-name ${contractName} \
    --chaincode-version ${version} \
    --sequence ${sequence} \
    --enable-tls \
    --tls-ca-cert-file /weaver/peer/tls-ca-cert.pem \
    --peer-addresses org-a-peer-0:7031,org-b-peer-0:7032,org-c-peer-0:7033 \
    --peer-root-tls ./weaver/peer/tls-ca-cert.pem,./weaver/peer/org-b-tls-ca-cert.pem,./weaver/peer/org-c-tls-ca-cert.pem`);
}

export async function ensureContractReadiness(
  contractName: string,
  dockerName: string = "org-a-peer-0",
  tlsCert: string = "tls-ca-cert.pem",
  counter = 0
): Promise<string> {
  try {
    // Prepare the JSON argument for the chaincode
    const chaincodeArgs = JSON.stringify({
      function: "healthcheck",
      Args: [],
    });

    if (counter > 10) {
      return "";
    }

    // Invoke the chaincode
    const res = execSync(
      `docker exec ${dockerName} peer chaincode query \
        -C simple-channel \
        -n ${contractName} \
        -c '${chaincodeArgs}' \
        --tls --cafile /weaver/peer/${tlsCert}`
    );

    const result = JSON.parse(res.toString());

    return result.healthcheck.toString();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (err: any) {
    console.log("Chaincode not ready. Retrying...");
    await new Promise((r) => setTimeout(r, 5000)); // Wait for 5 seconds before retrying
    return ensureContractReadiness(
      contractName,
      dockerName,
      tlsCert,
      counter++
    );
  }
}

export function trim(str: string): string {
  console.warn("Contract not trimming response properly: ", str);
  return str.trim();
}

export function invokeChaincode(
  contractName: string,
  functionName: string,
  args: any[],
  transient: any = {},
  dockerName: string = "org-a-peer-0",
  tls: string = "tls-ca-cert.pem"
) {
  // Prepare the JSON argument for the chaincode
  const chaincodeArgs = JSON.stringify({
    function: functionName,
    Args: args,
  });

  const transientData = JSON.stringify(transient);
  const transientString = `--transient '${transientData}'`;

  // Invoke the chaincode
  return execSync(
    `docker exec ${dockerName} peer chaincode invoke \
    -C simple-channel \
    -n ${contractName} \
    -c '${chaincodeArgs}' \
    --peerAddresses org-a-peer-0:7031 \
    --tlsRootCertFiles /weaver/peer/tls-ca-cert.pem \
    --peerAddresses org-b-peer-0:7032 \
    --tlsRootCertFiles /weaver/peer/org-b-tls-ca-cert.pem \
    --peerAddresses org-c-peer-0:7033 \
    --tlsRootCertFiles /weaver/peer/org-c-tls-ca-cert.pem \
    -o org-a-orderer-0:7021 \
    --tls --cafile /weaver/peer/${tls} \
    ${transient ? transientString : ""}`
  );
}

export function queryChaincode(
  contractName: string,
  functionName: string,
  args: any[],
  dockerName: string = "org-a-peer-0",
  tls: string = "tls-ca-cert.pem"
) {
  try {
    // Prepare the JSON argument for the chaincode
    const chaincodeArgs = JSON.stringify({
      function: functionName,
      Args: args,
    });

    // Invoke the chaincode
    const res = execSync(
      `docker exec ${dockerName} peer chaincode query \
        -C simple-channel \
        -n ${contractName} \
        -c '${chaincodeArgs}' \
        --tls --cafile ${tls}`
    );

    const processed = res.toString();
    console.log("Blockchain read:", processed);

    return processed;
  } catch (err: any) {
    console.log("Failed to read blockchain");
    throw err;
  }
}

export function invokePrivateChaincode(
  contractName: string,
  functionName: string,
  args: any[],
  transient: any = {},
  dockerName: string = "org-a-peer-0",
  tls: string = "tls-ca-cert.pem"
) {
  // Prepare the JSON argument for the chaincode
  const chaincodeArgs = JSON.stringify({
    function: functionName,
    Args: args,
  });

  const transientData = JSON.stringify(transient);
  const transientString = `--transient '${transientData}'`;

  // Invoke the chaincode
  return execSync(
    `docker exec ${dockerName} peer chaincode invoke \
    -C simple-channel \
    -n ${contractName} \
    -c '${chaincodeArgs}' \
    --peerAddresses org-a-peer-0:7031 \
    --tlsRootCertFiles /weaver/peer/tls-ca-cert.pem \
    -o org-a-orderer-0:7021 \
    --tls --cafile /weaver/peer/${tls} \
    ${transient ? transientString : ""}`
  );

  //   --peerAddresses org-b-peer-0:7032 \
  // --tlsRootCertFiles /weaver/peer/org-b-tls-ca-cert.pem \
  // --peerAddresses org-c-peer-0:7033 \
  // --tlsRootCertFiles /weaver/peer/org-c-tls-ca-cert.pem \
}

export enum ScriptCommands {
  START = "fabric-chaincode-node start \
          --grpc.max_receive_message_length ${CHAINCODE_MAXRECVMSGSIZE-15728640} \
          --grpc.max_send_message_length ${CHAINCODE_MAXSENDMSGSIZE-15728640} ",
  START_CCAAS = "fabric-chaincode-node server \
          --chaincode-address=$CHAINCODE_SERVER_ADDRESS \
          --chaincode-id=$CHAINCODE_ID \
          --chaincode-tls-cert-file=${CHAINCODE_TLS_CERT} \
          --chaincode-tls-key-file=${CHAINCODE_TLS_KEY} \
          --grpc.max_receive_message_length ${CHAINCODE_MAXRECVMSGSIZE-15728640} \
          --grpc.max_send_message_length ${CHAINCODE_MAXSENDMSGSIZE-15728640} \
          --tls.enabled=true",
  START_CCAAS_DEBUG = "node --inspect=0.0.0.0:9229 ./node_modules/.bin/fabric-chaincode-node server \
          --chaincode-address=$CHAINCODE_SERVER_ADDRESS \
          --chaincode-id=$CHAINCODE_ID \
          --chaincode-tls-cert-file=${CHAINCODE_TLS_CERT} \
          --chaincode-tls-key-file=${CHAINCODE_TLS_KEY} \
          --grpc.max_receive_message_length ${CHAINCODE_MAXRECVMSGSIZE-15728640} \
          --grpc.max_send_message_length ${CHAINCODE_MAXSENDMSGSIZE-15728640} \
          --tls.enabled=true",
  START_DEBUG = "node --inspect=0.0.0.0:9229 /usr/local/src/node_modules/.bin/fabric-chaincode-node start \
          --grpc.max_receive_message_length ${CHAINCODE_MAXRECVMSGSIZE-15728640} \
          --grpc.max_send_message_length ${CHAINCODE_MAXSENDMSGSIZE-15728640}",
}

export function getContractStartCommand(
  debug: boolean,
  ccaas: boolean
): string {
  if (ccaas) {
    return debug
      ? ScriptCommands.START_CCAAS_DEBUG
      : ScriptCommands.START_CCAAS;
  }
  return debug ? ScriptCommands.START_DEBUG : ScriptCommands.START;
}

function formatDiagnostics(diags: readonly ts.Diagnostic[]): string {
  const host: ts.FormatDiagnosticsHost = {
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
  };
  return ts.formatDiagnosticsWithColorAndContext(diags, host);
}

export function compileWithTsconfigOverrides(
  tsconfigPath: string,
  overrides: Partial<ts.CompilerOptions>
): void {
  const absConfigPath = path.isAbsolute(tsconfigPath)
    ? tsconfigPath
    : path.resolve(process.cwd(), tsconfigPath);

  // 1) Read the tsconfig.json
  const configFile = ts.readConfigFile(absConfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(formatDiagnostics([configFile.error]));
  }

  // 2) Parse it (resolves "extends", include/exclude/files, etc.)
  const configDir = path.dirname(absConfigPath);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    configDir,
    /*existingOptions*/ undefined,
    absConfigPath
  );

  if (parsed.errors.length) {
    throw new Error(formatDiagnostics(parsed.errors));
  }

  // 3) Override compiler options in-memory
  const options: ts.CompilerOptions = {
    ...parsed.options,
    ...overrides,
  };

  // Optional: If you override outDir/rootDir, ensure they’re absolute
  // to avoid surprises depending on CWD.
  if (options.outDir) options.outDir = path.resolve(configDir, options.outDir);
  if (options.rootDir)
    options.rootDir = path.resolve(configDir, options.rootDir);

  // 4) Create program + emit
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options,
    projectReferences: parsed.projectReferences,
  });

  const preEmit = ts.getPreEmitDiagnostics(program);
  if (preEmit.length) {
    // If you want "transpile anyway", you can choose to not throw here.
    throw new Error(formatDiagnostics(preEmit));
  }

  const emitResult = program.emit();
  const emitDiagnostics = emitResult.diagnostics ?? [];
  if (emitDiagnostics.length) {
    throw new Error(formatDiagnostics(emitDiagnostics));
  }

  if (emitResult.emitSkipped) {
    throw new Error("Emit was skipped (check diagnostics above).");
  }
}
