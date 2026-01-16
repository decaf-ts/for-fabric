import { Command } from "commander";
import { Logging, toPascalCase } from "@decaf-ts/logging";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { rollup } from "rollup";
import replace from "@rollup/plugin-replace";
import typescript from "@rollup/plugin-typescript";
import { InternalError } from "@decaf-ts/db-decorators";
import {
  generateModelIndexes,
  readModelFile,
  readModelFolders,
  writeIndexes,
} from "./client/indexes";
import { Model } from "@decaf-ts/decorator-validation";
import {
  approveContract,
  ensureInfrastructureBooted,
  installContract,
  packageContract,
  commitChaincode,
  getContractStartCommand,
} from "./cli-utils";
import "./shared/overrides";

const logger = Logging.for("fabric");

const compileCommand = new Command()
  .name("compile-contract")
  .description("Creates a global contract")
  .option("--dev", "compiles contracts without minification", false)
  .option("--debug", "makes attaching debugger possible", false)
  .option("--ccaas", "makes attaching debugger possible", false)
  .option("--name <String>", "contract name", "global-contract")
  .option(
    "--description <String>",
    "contract description",
    "Global contract implementation"
  )
  .option("--strip-contract-name", "strip contract name from output", false)
  .option("--input <String>", "input folder for contracts", "lib/contracts")
  .option("--output <String>", "output folder for contracts", "./contracts")
  .action(async (options: any) => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
    );

    const version = pkg.version;

    let {
      // eslint-disable-next-line prefer-const
      dev,
      // eslint-disable-next-line prefer-const
      debug,
      // eslint-disable-next-line prefer-const
      name,
      // eslint-disable-next-line prefer-const
      description,
      output,
      // eslint-disable-next-line prefer-const
      input,
      // eslint-disable-next-line prefer-const
      stripContractName,
      // eslint-disable-next-line prefer-const
      ccaas,
    } = options;
    const log = logger.for("compile-contract");
    log.debug(
      `running with options: ${JSON.stringify(options)} for ${pkg.name} version ${version}`
    );

    output = stripContractName ? output : path.join(output, name);
    log.info(`Deleting existing output folder (if exists) under ${output}`);
    execSync(`rm -rf ${output}`);
    log.info(`bundling contract from ${input}`);
    const bundle = await rollup({
      input: `${input}/index.ts`,
      plugins: [
        replace({
          preventAssignment: true,
          delimiters: ["", ""],
          values: { "##VERSION##": version, "##PACKAGE##": pkg.name },
        }),
        typescript({
          tsconfig: "./tsconfig.json",
          compilerOptions: {
            outDir: output,
          },
          module: "esnext",
          declaration: false,
        }),
      ],
    });
    log.info(
      `withing contract to ${output} with name ${toPascalCase(name)}.js`
    );
    await bundle.write({
      file: `${output}/${toPascalCase(name)}.js`,
      format: "umd",
      name: `${toPascalCase(name)}.js`,
    });

    const scripts = {
      start: getContractStartCommand(debug, ccaas),
      "start:dev": "fabric-chaincode-node start --tls.enabled false",
      "start:watch": 'nodemon --exec "npm run start:dev"',
      build: 'echo "No need to build the chaincode"',
      lint: "eslint . --fix --ext .js",
    };

    const contractPackage = pkg;

    contractPackage.name = name;
    contractPackage.description = description;
    contractPackage.scripts = scripts;

    delete contractPackage.type;
    delete contractPackage.types;
    delete contractPackage.exports;
    contractPackage.main = `${toPascalCase(name)}.js`;

    fs.writeFileSync(
      path.join(output, "package.json"),
      JSON.stringify(contractPackage)
    );

    log.info(`Installing and shrinkwrapping dependencies`);
    execSync(`npm install`, { cwd: output });
    execSync(`npm shrinkwrap`, { cwd: output });
    execSync("rm -rf node_modules", { cwd: output });
    log.info(`deleting temp folders`);
    execSync(`rm -rf ./lib && rm -rf ./dist`, { cwd: output });
    log.info(
      `Contract ${name} compiled successfully! in ${path.resolve(output)}`
    );
    if (dev) {
      log.info(`dev mode enabled. installing dependencies for debugging`);
      execSync(`npm install`, {
        cwd: output,
        env: { ...process.env, NODE_ENV: "production" },
      });
    }
  });

const extractIndexes = new Command()
  .command("extract-indexes")
  .option("--file [String]", "the model file")
  .option("--folder [String]", "the model folder")
  .option("--outDir <String>", "the outdir. should match your contract folder")
  .description(
    "Creates a the JSON index files to be submitted to along with the contract"
  )
  .action(async (options: any) => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
    );

    const version = pkg.version;

    const log = logger.for("extract-indexes");
    log.debug(
      `running with options: ${JSON.stringify(options)} for ${pkg.name} version ${version}`
    );

    // eslint-disable-next-line prefer-const
    let { file, folder, outDir } = options;

    const models: any[] = [];
    if (file) {
      models.push(...readModelFile(file));
    }

    if (folder) {
      log.info(`Loading models from ${folder}...`);
      models.push(...(await readModelFolders(folder)));
    }
    const result: Record<string, any> = {};

    if (!file && !folder)
      throw new InternalError(`Must pass a file or a folder`);

    for (const m of models) {
      log.verbose(`Extracting indexes for table ${Model.tableName(m)}`);
      generateModelIndexes(m, result);
    }
    log.verbose(`Found ${Object.keys(result).length} indexes to create`);
    log.debug(`Indexes: ${JSON.stringify(result)}`);
    writeIndexes(Object.values(result), outDir);
  });

const extractCollections = new Command()
  .command("extract-collections")
  .option("--file [String]", "the model file")
  .option("--folder [String]", "the model folder")
  .option("--outDir <String>", "the outdir. should match your contract folder")
  .description(
    "Creates a the JSON index files to be submitted to along with the contract"
  )
  .action(async (options: any) => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
    );

    const version = pkg.version;

    const log = logger.for("extract-collections");
    log.debug(
      `running with options: ${JSON.stringify(options)} for ${pkg.name} version ${version}`
    );

    // eslint-disable-next-line prefer-const
    let { file, folder, outDir } = options;

    const models: any[] = [];
    if (file) {
      models.push(...readModelFile(file));
    }

    if (folder) {
      log.info(`Loading models from ${folder}...`);
      models.push(...(await readModelFolders(folder)));
    }
    const result: Record<string, any> = {};

    if (!file && !folder)
      throw new InternalError(`Must pass a file or a folder`);

    const privateOrShared = models.filter(
      (m) => Model.isPrivate(m) || Model.isShared(m)
    );

    for (const m of privateOrShared) {
      log.verbose(`Extracting collections for table ${Model.tableName(m)}`);
      generateModelIndexes(m, result);
    }
    log.verbose(`Found ${Object.keys(result).length} indexes to create`);
    log.debug(`Indexes: ${JSON.stringify(result)}`);
    writeIndexes(Object.values(result), outDir);
  });

const ensureInfra = new Command()
  .name("await-infra")
  .description("waits for the infrastructure to be up and running")
  .option(
    "--container <String>",
    "docker container name to test (usually last peer)",
    "boot-org-c-peer-0"
  )
  .option("--timeout <String>", "timeout between tests in milliseconds", "5000")
  .option("--attempts <String>", "number of attempts before giving up", "10")
  .action(async (options: any) => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
    );

    const version = pkg.version;

    const log = logger.for("await-infra");
    log.debug(
      `running with options: ${JSON.stringify(options)} for ${pkg.name} version ${version}`
    );
    // eslint-disable-next-line prefer-const
    let { container, timeout, attempts } = options;
    timeout = parseInt(timeout) || 5000;
    attempts = parseInt(attempts) || 10;

    await ensureInfrastructureBooted("boot-org-c-peer-0", timeout, attempts);

    log.info(
      `Infrastructure booted successfully (according to container ${container})!`
    );
  });

const deployContract = new Command()
  .name("deploy-contract")
  .description("deploys the selected contract")
  .option("--name <String>", "Contract Name (and folder)")
  .option("--input <String>", "input folder")
  .option(
    "--incrementVersion <String>",
    "(true | false) if should use version or sequence to update contracts",
    false
  )
  .option(
    "--trackerFolder <String>",
    "contract version tracker folder (should be deleted on infrastructure:down)",
    path.join(process.cwd(), "tests", "integration", "chaincodeTrackers")
  )
  .option(
    "--peers <String>",
    "comma separated peer ids",
    "org-a-peer-0,org-b-peer-0,org-c-peer-0"
  )
  .action(async (options: any) => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
    );

    const version = pkg.version;

    const log = logger.for("deploy-contract");
    log.debug(
      `running with options: ${JSON.stringify(options)} for ${pkg.name} version ${version}`
    );
    const { name, input, peers, trackerFolder, incrementVersion } = options;
    const peerIds = peers.split(",");

    const countPath = path.resolve(path.join(trackerFolder, `${name}.count`));

    let sequence: number;

    try {
      sequence = parseInt(fs.readFileSync(countPath).toString("utf-8"));
      if (isNaN(sequence)) sequence = 1;
      else sequence += 1;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      sequence = 1;
    }
    //
    // if (incrementVersion) {
    //   version = version + `-${sequence}`;
    //   // sequence = 1;
    // }

    try {
      for (const peer of peerIds) {
        packageContract(peer, input, name, version);
        installContract(peer, name);
        approveContract(
          peer,
          name,
          peer === "org-a-peer-0"
            ? "tls-ca-cert.pem"
            : "orderer-tls-ca-cert.pem",
          sequence,
          version
        );
      }
      fs.writeFileSync(countPath, sequence.toString());
    } catch (err: any) {
      log.error("Error deploying contract:", err);
    }
    commitChaincode(name, sequence, version);
  });

const getCryptoMaterial = new Command()
  .name("get-crypto-material")
  .description("copies the crypto material to the selected folder")
  .option("--folder <String>", "output folder", "docker/docker-data")
  .action(async (options: any) => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
    );

    const version = pkg.version;

    const log = logger.for("get-crypto-material");
    log.debug(
      `running with options: ${JSON.stringify(options)} for ${pkg.name} version ${version}`
    );
    const { folder } = options;
    execSync(`docker cp org-a:/weaver/client/. ${folder}`, {
      cwd: process.cwd(),
    });
  });

const fabricCmd = new Command()
  .name("for-fabric")
  .command("fabric")
  .description(
    "exposes several commands to help manage the fabric infrastructure"
  );

fabricCmd.addCommand(compileCommand);
fabricCmd.addCommand(extractIndexes);
fabricCmd.addCommand(ensureInfra);
fabricCmd.addCommand(deployContract);
fabricCmd.addCommand(getCryptoMaterial);

export default function fabric() {
  return fabricCmd;
}
