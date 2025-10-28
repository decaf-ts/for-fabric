import path from "path";
import fs from "fs";
import { Command } from "commander";
import { execSync } from "child_process";
const program = new Command();

program
  .command("compile-contract")
  .description("Creates a global contract")
  .option("--dev", "compiles contracts without minification", false)
  .option("--debug", "enables inspector", false)
  .option("--name <String>", "contract name", "contract")
  .option("--output <String>", "output", undefined)
  .action(async (options: any) => {
    const dev: boolean = options.dev;
    const debug: boolean = options.debug;

    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../../package.json"), "utf-8")
    );

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

    contractPackage.name = options.name;
    contractPackage.description = "Global contract implementation";
    contractPackage.scripts = scripts;

    delete contractPackage.type;
    delete contractPackage.types;
    delete contractPackage.exports;
    contractPackage.main = "index.js";

    fs.writeFileSync(
      path.join(__dirname, "../../", options.output, "package.json"),
      JSON.stringify(contractPackage)
    );

    execSync(
      `cd ${path.join(__dirname, "../../", options.output)} && npm install`
    );
    execSync(
      `cd ${path.join(__dirname, "../../", options.output)}  && npm shrinkwrap`
    );
    // execSync(
    //   `cd ${path.join(__dirname, "../../", options.output)}  && rm -rf node_modules`
    // );
  });

program.parse(process.argv);
