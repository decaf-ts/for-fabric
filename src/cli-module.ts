import { Command } from "commander";
import { Logging, toPascalCase } from "@decaf-ts/logging";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { builtinModules, createRequire } from "node:module";
import { Plugin, rollup } from "rollup";
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
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

const logger = Logging.for("fabric");

function resolveBundledJsImports(): Plugin {
  return {
    name: "resolve-bundled-js-imports",
    resolveId(source, importer) {
      if (!importer || !source.startsWith(".")) {
        return null;
      }

      const resolvedPath = path.resolve(path.dirname(importer), source);
      const candidates = [
        resolvedPath,
        `${resolvedPath}.js`,
        path.join(resolvedPath, "index.js"),
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      }

      return null;
    },
  };
}

function resolveDecafPackageImports(): Plugin {
  const contractRequire = createRequire(
    path.join(process.cwd(), "package.json")
  );

  return {
    name: "resolve-decaf-package-imports",
    resolveId(source) {
      if (!source.startsWith("@decaf-ts/")) {
        return null;
      }

      try {
        return contractRequire.resolve(source);
      } catch {
        return null;
      }
    },
  };
}

const fabricPeerDependencies = new Set([
  "@grpc/grpc-js",
  "@hyperledger/fabric-gateway",
  "@peculiar/webcrypto",
  "fabric-ca-client",
  "fabric-common",
  "fabric-contract-api",
  "fabric-network",
  "fabric-shim",
  "fabric-shim-api",
]);

function isNodeBuiltin(id: string): boolean {
  const normalized = id.startsWith("node:") ? id.slice(5) : id;
  return builtinModules.includes(normalized);
}

function shouldBundleContractModule(id: string): boolean {
  if (id.startsWith(".") || path.isAbsolute(id)) return true;
  if (id.startsWith("@decaf-ts/")) return true;
  if (fabricPeerDependencies.has(id)) return false;
  if (isNodeBuiltin(id)) return false;
  return true;
}

function normalizeSideEffectPath(input: string): string {
  return input.split(path.sep).join("/");
}

function buildSideEffectMatcher(extraPaths: string[]) {
  const normalizedExtras = extraPaths.map((extraPath) => {
    const normalized = normalizeSideEffectPath(extraPath.trim());
    return {
      raw: normalized,
      resolved: path.isAbsolute(extraPath)
        ? normalizeSideEffectPath(path.resolve(extraPath))
        : normalizeSideEffectPath(path.resolve(process.cwd(), extraPath)),
    };
  });

  return (id: string): boolean => {
    const normalized = normalizeSideEffectPath(id);
    const builtIns = [
      "/src/contracts/bootstrap",
      "/src/contracts/overrides",
      "/src/contracts/fabric-overrides",
      "/src/shared/overrides",
      "/node_modules/@decaf-ts/",
    ];

    if (builtIns.some((needle) => normalized.includes(needle))) {
      return true;
    }

    return normalizedExtras.some(({ raw, resolved }) => {
      return (
        normalized.includes(raw) ||
        normalized.includes(resolved) ||
        normalized.endsWith(`${raw}.js`) ||
        normalized.endsWith(`${raw}.cjs`) ||
        normalized.endsWith(`${raw}/index.js`) ||
        normalized.endsWith(`${raw}/index.cjs`) ||
        normalized.endsWith(`${resolved}.js`) ||
        normalized.endsWith(`${resolved}.cjs`) ||
        normalized.endsWith(`${resolved}/index.js`) ||
        normalized.endsWith(`${resolved}/index.cjs`)
      );
    });
  };
}

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
  .option("--sourcemaps", "includes sourcemaps in the compiled output", false)
  .option("--npmrc", "includes .npmrc in the compiled output", false)
  .option(
    "--side-effect-paths <paths...>",
    "additional paths or package roots that must be preserved as side-effectful during contract bundling"
  )
  .action(async (options: any) => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
    );

    const pkgLock = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package-lock.json"), "utf-8")
    );

    let npmrcContent = undefined;

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
      // eslint-disable-next-line prefer-const
      sourcemaps,
      // eslint-disable-next-line prefer-const
      npmrc,
      // eslint-disable-next-line prefer-const
      sideEffectPaths,
    } = options;
    const log = logger.for("compile-contract");
    try {
      if (npmrc) {
        npmrcContent = fs
          .readFileSync(path.join(process.cwd(), ".npmrc"), "utf-8")
          .toString();

        const replaced = npmrcContent.replace(
          /\$\{([^}]+)\}/g,
          (_: any, varName: string) => {
            const value = process.env[varName];

            if (value === undefined) {
              console.warn(
                `Warning: Environment variable "${varName}" is not set`
              );
              return "";
            }

            return value;
          }
        );

        npmrcContent = replaced;
      }
    } catch {
      log.info(`No .npmrc file found, skipping copying .npmrc to output`);
    }

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
      const sideEffectMatcher = buildSideEffectMatcher(
        Array.isArray(sideEffectPaths) ? sideEffectPaths : []
      );
      log.info(`bundling contract from ${input}`);
      const tempBundleDir = fs.mkdtempSync(
        path.join(process.cwd(), ".contract-bundle-")
      );
      try {
        const inputEntry = path.resolve(process.cwd(), input, "index.ts");
        const configFile = ts.readConfigFile(tsConfigFile, ts.sys.readFile);
        if (configFile.error) {
          throw new InternalError(
            ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n")
          );
        }

        const parsedConfig = ts.parseJsonConfigFileContent(
          configFile.config,
          ts.sys,
          path.dirname(tsConfigFile),
          undefined,
          tsConfigFile
        );
        if (parsedConfig.errors.length) {
          throw new InternalError(
            parsedConfig.errors
              .map((error) =>
                ts.flattenDiagnosticMessageText(error.messageText, "\n")
              )
              .join("\n")
          );
        }

        const tempCompilerOptions: ts.CompilerOptions = {
          ...parsedConfig.options,
          outDir: tempBundleDir,
          module: ts.ModuleKind.ESNext,
          declaration: false,
          sourceMap: false,
          inlineSources: false,
        };
        const bundledEntryPoint = ts
          .getOutputFileNames(
            {
              ...parsedConfig,
              options: tempCompilerOptions,
            },
            inputEntry,
            !ts.sys.useCaseSensitiveFileNames
          )
          .find((fileName) => fileName.endsWith(".js"));

        if (!bundledEntryPoint) {
          throw new InternalError(
            `Failed to determine the emitted bundle entry for ${inputEntry}`
          );
        }

        compileWithTsconfigOverrides(tsConfigFile, tempCompilerOptions);
        const bundledContract = await rollup({
          input: bundledEntryPoint,
          external: (id) => !shouldBundleContractModule(id),
          treeshake: {
            moduleSideEffects: (id) => sideEffectMatcher(id),
          },
          plugins: [
            resolveDecafPackageImports(),
            resolveBundledJsImports(),
            nodeResolve({
              extensions: [".mjs", ".js", ".json", ".cjs", ".ts"],
              moduleDirectories: ["node_modules"],
              modulePaths: [path.join(process.cwd(), "node_modules")],
              exportConditions: ["node", "default", "require", "import"],
              preferBuiltins: true,
            }),
            commonjs({
              include: /node_modules/,
            }),
            replace({
              preventAssignment: true,
              delimiters: ["", ""],
              values: { "##VERSION##": version, "##PACKAGE##": pkg.name },
            }),
          ],
        });
        log.info(
          `withing contract to ${output} with name ${toPascalCase(name)}.js`
        );
        await bundledContract.write({
          file: `${output}/${toPascalCase(name)}.js`,
          format: "umd",
          name: `${toPascalCase(name)}.js`,
          sourcemap: sourcemaps ? "inline" : false,
          sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
            const absoluteSourcePath = path.resolve(
              path.dirname(sourcemapPath),
              relativeSourcePath
            );

            if (absoluteSourcePath.startsWith(tempBundleDir)) {
              return path.posix.join(
                ".bundle",
                path
                  .relative(tempBundleDir, absoluteSourcePath)
                  .split(path.sep)
                  .join("/")
              );
            }

            return relativeSourcePath;
          },
        });
        await bundledContract.close();
      } finally {
        fs.rmSync(tempBundleDir, { recursive: true, force: true });
      }
    } else {
      compileWithTsconfigOverrides(tsConfigFile, {
        outDir: output,
        module: ts.ModuleKind.ESNext,
        declaration: false,
        sourceMap: sourcemaps,
        inlineSources: sourcemaps,
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
    const contractPackageLock = pkgLock;

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

    fs.writeFileSync(
      path.join(output, "package-lock.json"),
      JSON.stringify(contractPackageLock)
    );

    if (npmrc && npmrcContent)
      fs.writeFileSync(path.join(output, ".npmrc"), npmrcContent);

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
    let { file, folder, outDir, mspIds, mainMspId } = options;

    try {
      try {
        mspIds = mspIds ? JSON.parse(mspIds) : undefined;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e: unknown) {
        //  do nothing
      }
    } catch (e: unknown) {
      throw new SerializationError(`Unable to extract mspids:  ${e}`);
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

      cols.forEach((c) => {
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  .option("--org [String]", "the org/peer to extract from", "org-a")
  .action(async (options: any) => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
    );

    const version = pkg.version;

    const log = logger.for("get-crypto-material");
    log.debug(
      `running with options: ${JSON.stringify(options)} for ${pkg.name} version ${version}`
    );
    const { folder, org } = options;
    execSync(`docker cp ${org}:/weaver/client/. ${folder}`, {
      cwd: process.cwd(),
    });
  });

const getCopyToPTP = new Command()
  .name("prepare-ptp")
  .description("copies contract to the ptp folder")
  .option("--origin-folder <String>", "origin workspace folder", undefined)
  .option(
    "--dest-folder <String>",
    "folder to the destination workspace",
    undefined
  )
  .action(async (options: any) => {
    if (!(options.originFolder && options.destFolder)) {
      logger
        .for("prepare-ptp")
        .error(
          "Both --origin-folder and --dest-folder options are required to prepare-ptp"
        );
      return;
    }

    function copyFolder(source: string, target: string) {
      // Remove existing target folder
      if (fs.existsSync(target)) {
        fs.rmSync(target, {
          recursive: true,
          force: true,
        });
      }

      // Ensure parent exists
      fs.mkdirSync(path.dirname(target), {
        recursive: true,
      });

      // Copy folder
      fs.cpSync(source, target, {
        recursive: true,
        force: true,
      });

      console.log(`Copied: ${source} 
      -> ${target}`);
    }

    const origin = path.resolve(options.originFolder);
    const dest = path.resolve(options.destFolder);

    execSync(`cd for-fabric && npm run build`, {
      cwd: origin,
      stdio: "inherit",
    });
    execSync(`cd for-fabric && npm run build:contract:shared`, {
      cwd: origin,
      stdio: "inherit",
    });

    const sourceLib = path.join(origin, "for-fabric", "lib");
    const targetLib = path.join(dest, "infra", "for-fabric", "lib");

    copyFolder(sourceLib, targetLib);

    const sourceGlobal = path.join(
      origin,
      "docker",
      "infrastructure",
      "chaincode",
      "Global"
    );

    const targetContracts = path.join(dest, "toolkit", "contracts");

    fs.mkdirSync(targetContracts, {
      recursive: true,
    });

    for (const item of fs.readdirSync(sourceGlobal)) {
      const sourceItem = path.join(sourceGlobal, item);
      const targetItem = path.join(targetContracts, item);

      // Remove existing target item if needed
      if (fs.existsSync(targetItem)) {
        fs.rmSync(targetItem, {
          recursive: true,
          force: true,
        });
      }

      fs.cpSync(sourceItem, targetItem, {
        recursive: true,
        force: true,
      });

      console.log(`Copied: ${sourceItem} 
      -> ${targetItem}`);
    }

    execSync(`cd toolkit && npm run build`, { cwd: dest, stdio: "inherit" });
    execSync(`cd toolkit && npm run docker:build-contracts`, {
      cwd: dest,
      stdio: "inherit",
    });
    execSync(`cd infra && npm run build`, { cwd: dest, stdio: "inherit" });
    execSync(`cd infra && npm run build:jest:image`, {
      cwd: dest,
      stdio: "inherit",
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
fabricCmd.addCommand(getCopyToPTP);

export default function fabric() {
  return fabricCmd;
}
