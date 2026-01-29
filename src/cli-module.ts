import { Command } from "commander";
import { Logging, toPascalCase } from "@decaf-ts/logging";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { rollup } from "rollup";
import replace from "@rollup/plugin-replace";
import typescript from "@rollup/plugin-typescript";
import { InternalError, SerializationError } from "@decaf-ts/db-decorators";
import {
  generateModelDesignDocs,
  generateModelIndexes,
  readModelFile,
  readModelFolders,
  writeDesignDocs,
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
  compileWithTsconfigOverrides,
} from "./cli-utils";
import "./shared/overrides";
import ts from "typescript";
import {
  extractCollections as exCollections,
  PrivateCollection,
  writeCollections,
  writeCollectionDesignDocs,
} from "./client/collections/index";
import { CouchDBDesignDoc, CreateIndexRequest } from "@decaf-ts/for-couchdb";
import { Metadata } from "@decaf-ts/decoration";

const logger = Logging.for("fabric");

const compileCommand = new Command()
  .name("compile-contract")
  .description("Creates a global contract")
  .option("--dev", "compiles contracts without minification", false)
  .option("--debug", "makes attaching debugger possible", false)
  .option(
    "--ccaas",
    "Ajusts the package commands to be deployed as ccaas",
    false
  )
  .option("--name <String>", "contract name", "global-contract")
  .option("--bundle", "Bundles with rollup instead of using tsc", false)
  .option(
    "--ts-config-file <string>",
    "relative path to the ts config file based on cwd or absolute path",
    "./tsconfig.json"
  )
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
      // eslint-disable-next-line prefer-const
      bundle,

      tsConfigFile,
    } = options;
    const log = logger.for("compile-contract");
    log.debug(
      `running with options: ${JSON.stringify(options)} for ${pkg.name} version ${version}`
    );

    tsConfigFile = path.isAbsolute(tsConfigFile)
      ? tsConfigFile
      : path.join(process.cwd(), tsConfigFile);

    output = stripContractName ? output : path.join(output, name);
    log.info(`Deleting existing output folder (if exists) under ${output}`);
    execSync(`rm -rf ${output}`);
    if (bundle) {
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
            tsconfig: tsConfigFile,
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
    } else {
      compileWithTsconfigOverrides(tsConfigFile, {
        outDir: output,
        module: ts.ModuleKind.ESNext,
        declaration: false,
        sourceMap: false,
        // rootDir: input,
      });
    }

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
    contractPackage.main = bundle
      ? `${toPascalCase(name)}.js`
      : `${input}/index.js`;

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
    const designDocs: Record<string, any> = {};

    if (!file && !folder)
      throw new InternalError(`Must pass a file or a folder`);

    for (const m of models) {
      log.verbose(`Extracting indexes for table ${Model.tableName(m)}`);
      const indexes = generateModelIndexes(m);
      indexes.forEach((index) => {
        if (index.name) {
          result[index.name] = index;
        }
      });
      generateModelDesignDocs(m, designDocs);
    }
    const indexesToWrite = Object.values(result);
    const docsToWrite = Object.values(designDocs);
    log.verbose(`Found ${indexesToWrite.length} indexes to create`);
    log.verbose(`Found ${docsToWrite.length} design docs to create`);
    log.debug(`Indexes: ${JSON.stringify(result)}`);
    log.debug(`DesignDocs: ${JSON.stringify(designDocs)}`);
    writeIndexes(indexesToWrite, outDir);
    writeDesignDocs(docsToWrite, outDir);
  });

const extractCollections = new Command()
  .command("extract-collections")
  .option("--file [String]", "the model file")
  .option("--folder [String]", "the model folder")
  .option("--outDir <String>", "the outdir. should match your contract folder")
  .option("--mspIds <String>", "single mspId or stringified array")
  .option("--mainMspId <String>", "single mspId")
  .option(
    "--overrides [String]",
    "stringified override object {requiredPeerCount: number, maxPeerCount: number, blockToLive: number, memberOnlyRead: number, memberOnlyWrite: number, endorsementPolicy:  {}}"
  )
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
    let { file, folder, outDir, mspIds, overrides, mainMspId } = options;

    try {
      try {
        mspIds = mspIds ? JSON.parse(mspIds) : undefined;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e: unknown) {
        //  do nothing
      }
      overrides = overrides
        ? JSON.parse(overrides)
        : { privateCols: {}, sharedCols: {} };
    } catch (e: unknown) {
      throw new SerializationError(
        `Unable to extract mspids or overrides:  ${e}`
      );
    }

    const models: any[] = [];
    if (file) {
      models.push(...readModelFile(file));
    }

    if (folder) {
      log.info(`Loading models from ${folder}...`);
      models.push(...(await readModelFolders(folder)));
    }

    if (!file && !folder)
      throw new InternalError(`Must pass a file or a folder`);

    const injectableModels = models.filter(
      (model) =>
        Model.isShared(model) ||
        Model.isPrivate(model) ||
        !!Model.mirroredAt(model)
    );
    if (!injectableModels.length) {
      log.info(
        `No shared, private, or mirrored models found to extract collections`
      );
      return;
    }

    async function getCols(mspIdsList?: string[]) {
      const cols: {
        indexes: CreateIndexRequest[];
        designDocs: CouchDBDesignDoc[];
        mirror?: PrivateCollection;
        collections: PrivateCollection[];
      }[] = await Promise.all(
        injectableModels.map(async (clazz) => {
          const tableName = Model.tableName(clazz);
          const meta = Metadata.get(clazz);
          const mirrorMeta = Model.mirroredAt(clazz);

          console.log(tableName);
          const collections: Record<string, any> = {};
          for (const msp of mspIdsList || mspIds || []) {
            collections[msp] = await exCollections(
              clazz,
              [msp, mainMspId],
              {},
              // {
              //   sharedCols: Object.assign({}, overrides.sharedCols),
              //   privateCols: Object.assign({}, overrides.privateCols),
              // },
              !!mirrorMeta
            );
          }

          let mirrorCollection: PrivateCollection | undefined = undefined;

          if (mirrorMeta) {
            collections[mainMspId] = collections[mainMspId] || {};
            Object.keys(collections).forEach((msp: string) => {
              collections[mainMspId].privates = collections[
                msp
              ].privates?.filter((p: any) => {
                if (p.name !== (mirrorMeta.resolver as string)) return true;
                mirrorCollection = p as any;
                return false;
              });
            });
          }

          const privatesCount = Object.values(collections)
            .map((c) => c.privates)
            .flat().length;
          if (privatesCount)
            log
              .for(Model.tableName(clazz))
              .info(`Found ${privatesCount} private collections to create`);
          const sharedCount = Object.values(collections)
            .map((c) => c.shared)
            .flat().length;

          log
            .for(Model.tableName(clazz))
            .info(`Found ${sharedCount} shared collections to create`);
          if (mirrorCollection)
            log
              .for(Model.tableName(clazz))
              .info(
                `Found one mirror collection ${mirrorMeta?.resolver as string}`
              );

          const colList = Object.values(collections)
            .map((c) => [...(c.privates || []), ...(c.shared || [])])
            .flat();
          let indexes: CreateIndexRequest[] = [];
          let designDocs: CouchDBDesignDoc[] = [];
          if (colList.length) {
            log
              .for(Model.tableName(clazz))
              .verbose(`generating indexes for collections`);
            indexes = generateModelIndexes(clazz);
            log
              .for(Model.tableName(clazz))
              .info(`found ${indexes.length} indexes`);
            designDocs = generateModelDesignDocs(clazz);
            log
              .for(Model.tableName(clazz))
              .info(`found ${designDocs.length} design docs`);
          }
          return {
            indexes,
            designDocs,
            collections: colList,
            mirror: mirrorCollection,
          };
        })
      );
      return cols;
    }

    const cols = await getCols();
    const onlyMirror = await getCols([mainMspId]);

    const collectionsTo = [
      ...onlyMirror.filter((c) => c.mirror).map((c) => c.mirror),
      ...cols.map((c) => c.collections).flat(),
      ...cols.filter((c) => c.mirror).map((c) => c.mirror),
    ] as PrivateCollection[];

    const uniqueByCollection = [
      ...new Map(
        collectionsTo.map((item: PrivateCollection) => [item.name, item])
      ).values(),
    ];

    if (uniqueByCollection.length) {
      writeCollections(uniqueByCollection, outDir);
      const metaCollectionsConfig = path.join(
        outDir,
        "META-INF",
        "collections_config.json"
      );
      const contractCollectionsConfig = path.join(
        outDir,
        "collections_config.json"
      );
      fs.copyFileSync(metaCollectionsConfig, contractCollectionsConfig);
      log.info(
        `Stored ${collectionsTo.length} collections to ${metaCollectionsConfig}`
      );
      log.info(
        `Copied collections_config to ${contractCollectionsConfig} alongside the package.json`
      );

      cols.forEach((c, i) => {
        const { indexes, designDocs, collections, mirror } = c;
        const toIndex: PrivateCollection[] = [...collections, mirror].filter(
          Boolean
        ) as PrivateCollection[];
        toIndex.forEach((i) => {
          writeIndexes(indexes, outDir, i.name);
          writeCollectionDesignDocs(designDocs || [], outDir, i.name);
          log.info(
            `Stored ${indexes?.length || 0} indexes and ${designDocs?.length || 0} design docs to collection ${i.name}`
          );
        });
      });
    }
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
    "--collections-config <String>",
    "path to collections_config.json to configure private collections"
  )
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

    const {
      name,
      input,
      peers,
      trackerFolder,
      incrementVersion,
      collectionsConfig,
    } = options;
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
          version,
          collectionsConfig
        );
      }
      fs.writeFileSync(countPath, sequence.toString());
    } catch (err: any) {
      log.error("Error deploying contract:", err);
    }
    commitChaincode(name, sequence, version, collectionsConfig);
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
fabricCmd.addCommand(extractCollections);

export default function fabric() {
  return fabricCmd;
}
