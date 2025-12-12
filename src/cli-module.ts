import { Command } from "commander";
import { runCommand } from "@decaf-ts/utils";
import { Logging, toPascalCase } from "@decaf-ts/logging";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { rollup } from "rollup";
import replace from "@rollup/plugin-replace";
import typescript from "@rollup/plugin-typescript";
import { InternalError } from "@decaf-ts/db-decorators";

const logger = Logging.for("fabric");

const compileCommand = new Command()
  .name("compile-contract")
  .description("Creates a global contract")
  .option("--dev", "compiles contracts without minification", false)
  .option("--debug", "makes attaching debugger possible", true)
  .option("--name <String>", "contract name", "global-contract")
  .option(
    "--description <String>",
    "contract description",
    "Global contract implementation"
  )
  .option("--input <String>", "input folder for contracts", "src/contracts")
  .option("--output <String>", "output folder for contracts", "./contracts")
  .action(async (options: any) => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
    );

    const version = pkg.version;

    const { dev, debug, name, description, output, input } = options;
    const log = logger.for("compile-contract");
    log.debug(
      `running with options: ${JSON.stringify(options)} for ${pkg.name} version ${version}`
    );

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
      start: debug
        ? "node --inspect=0.0.0.0:9229 /usr/local/src/node_modules/.bin/fabric-chaincode-node start"
        : "fabric-chaincode-node start",
      "start:dev":
        'fabric-chaincode-node start --peer.address "127.0.0.1:8541" --chaincode-id-name "chaincode1:0.0.1" --tls.enabled false',
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
    execSync(`cd ${output} && npm install`);
    execSync(`cd ${output} && npm shrinkwrap`);
    execSync("cd ${output} && rm -rf node_modules");

    log.info(`deleting temp folders`);
    execSync(`rm -rf ${output}/lib && rm -rf ${output}/dist`);
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
    // eslint-disable-next-line prefer-const
    let { container, timeout, attempts } = options;
    timeout = parseInt(timeout) || 5000;
    attempts = parseInt(attempts) || 10;
    const log = logger.for("await-infra");
    function didInfrastructureBoot(): boolean {
      try {
        const output = execSync(
          `docker inspect ${container} --format='{{.State.ExitCode}}'`
        )
          .toString()
          .trim();

        return output === "0";
      } catch (err: any) {
        console.error("Error inspecting container:", err.message);
        return false;
      }
    }

    while (!didInfrastructureBoot()) {
      if (--attempts <= 0) throw new InternalError("exceeded allowed attempts");
      log.info("Waiting for infrastructure to boot...");
      await new Promise((r) => setTimeout(r, timeout)); // Wait for 5 seconds before retrying
    }

    log.info(
      `Infrastructure booted successfully (according to container ${container})!`
    );
  });

const copyContracts = new Command()
  .name("copy-contracts")
  .description(
    "copies the contracts to the folder they'll be consumed by fabric"
  )
  .option("--input <String>", "input folder", "./contracts")
  .option(
    "--name <String>",
    "contract name (and folder name within input folder)",
    "global-contract"
  )
  .option(
    "--output <String>",
    "output folder",
    "./docker/infrastructure/chaincode"
  )
  .action(async (options: any) => {
    // eslint-disable-next-line prefer-const
    let { input, output, name } = options;

    const log = logger.for("copy-contracts");
    const inputPath = path.join(input, name);
    const outputPath = path.join(output, name);
    log.info(`deleting previous contract folder at ${outputPath}`);
    execSync(`rm -rf ${outputPath}`);
  });

export default function fabric() {
  const mainCommand = new Command()
    .name("fabric")
    .description(
      "exposes several commands to help manage the fabric infrastructure"
    );

  mainCommand.addCommand(compileCommand);
  mainCommand.addCommand(ensureInfra);

  return mainCommand;
}
