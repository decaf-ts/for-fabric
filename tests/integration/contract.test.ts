
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

jest.setTimeout(5000000);

describe("Test Basic Crud Contract", () =>  {

    beforeAll(async () => {
        // Compile/Transpile the contract to JavaScript
        execSync(`npx weaver compile-contract -d --contract-file ./tests/assets/contract/basic-crud-contract/index.ts --output-dir ./docker/infrastructure/chaincode`);


        // Copy necessary files to the chaincode directory
        fs.copyFileSync(path.join(process.cwd(), "./tests/assets/contract/test/package.json"), path.join(process.cwd(), "./docker/infrastructure/chaincode/package.json"));
        fs.copyFileSync(path.join(process.cwd(), "./tests/assets/contract/test/npm-shrinkwrap.json"), path.join(process.cwd(), "./docker/infrastructure/chaincode/npm-shrinkwrap.json"))

        //Boot infrastructure for testing
        execSync(`npm run infrastructure:up`);
    });


    it("should validate a TestModel instance", () => {
        console.log("Test model contract");
        console.log("Validate a TestModel instance");
    })
})