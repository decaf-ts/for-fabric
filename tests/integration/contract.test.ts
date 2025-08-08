
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

jest.setTimeout(5000000);

describe("Test test model contract", () =>  {

    beforeAll(async () => {
        execSync(`npx weaver compile-contract -d --contract-file ./tests/assets/contract/asset-transfer/index.ts --output-dir ./docker/infrastructure/chaincode`);
    
        fs.copyFileSync(path.join(process.cwd(), "./tests/assets/contract/asset-transfer/package.json"), path.join(process.cwd(), "./docker/infrastructure/chaincode/package.json"));
        fs.copyFileSync(path.join(process.cwd(), "./tests/assets/contract/asset-transfer/npm-shrinkwrap.json"), path.join(process.cwd(), "./docker/infrastructure/chaincode/npm-shrinkwrap.json"))
    });


    it("should validate a TestModel instance", () => {
        console.log("Test model contract");
        console.log("Validate a TestModel instance");
    })
})