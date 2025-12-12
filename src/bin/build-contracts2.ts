import path from "path";
import fs from "fs";
import { rollup } from "rollup";
import replace from "@rollup/plugin-replace";
import typescript from "@rollup/plugin-typescript";
import { Command } from "commander";
import { execSync } from "child_process";
const program = new Command();

program
  .command("compile-contract")
  .description("Creates a global contract")
  .option("--dev", "compiles contracts without minification", false)
  .option("--debug", "makes attaching debugger possible", false)
  .option("--name <String>", "contract name", "contract")
  .option("--output <String>", "output", undefined)
  .action(async (options: any) => {
    const dev: boolean = options.dev;

    execSync("rm -rf ./contracts");

    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../../package.json"), "utf-8")
    );

    const version = pkg.version;

    const bundle = await rollup({
      input: "./src/contracts/index.ts",
      plugins: [
        replace({
          preventAssignment: true,
          delimiters: ["", ""],
          values: { "##VERSION##": version, "##PACKAGE##": pkg.name },
        }),
        typescript({
          tsconfig: "./tsconfig.json",
          compilerOptions: {
            outDir: "contracts",
          },
          module: "esnext",
          declaration: false,
        }),
      ],
    });

    await bundle.write({
      file: "./contracts/GlobalContract.js",
      format: "umd",
      name: "GlobalContract.js",
    });

    const scripts = {
      start: options.debug
        ? "node --inspect=0.0.0.0:9229 /usr/local/src/node_modules/.bin/fabric-chaincode-node start"
        : "fabric-chaincode-node start",
      "start:dev":
        'fabric-chaincode-node start --peer.address "127.0.0.1:8541" --chaincode-id-name "chaincode1:0.0.1" --tls.enabled false',
      "start:watch": 'nodemon --exec "npm run start:dev"',
      build: 'echo "No need to build the chaincode"',
      lint: "eslint . --fix --ext .js",
    };

    const contractPackage = pkg;

    contractPackage.name = "global-contract";
    contractPackage.description = "Global contract implementation";
    contractPackage.scripts = scripts;

    delete contractPackage.type;
    delete contractPackage.types;
    delete contractPackage.exports;
    contractPackage.main = "GlobalContract.js";

    fs.writeFileSync(
      path.join(__dirname, "../../contracts/package.json"),
      JSON.stringify(contractPackage)
    );

    execSync("cd ./contracts && npm install");
    execSync("cd ./contracts && npm shrinkwrap");
    execSync("cd ./contracts && rm -rf node_modules");

    execSync("rm -rf ./contracts/lib && rm -rf ./contracts/dist");
  });

program.parse(process.argv);
