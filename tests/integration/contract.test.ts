
// import { min, minlength, model, Model, ModelArg, required, type } from "@decaf-ts/decorator-validation";
// import { RamAdapter } from "../../src/ram/RamAdapter";
// import { BaseModel, index, OrderDirection, pk, Repository, uses } from "../../src";
// import { readonly } from "@decaf-ts/db-decorators";

// import { execSync } from 'child_process';
import {compileContract} from "../../src/compile"
// Model.setBuilder(Model.fromModel);

jest.setTimeout(5000000);

describe("Test test model contract", () =>  {

    beforeAll(async () => {
        // compile contract
        // execSync(`weaver compile-contract -d --contract-path ./tests/assets/contract/test \
        //     --contract-filename TestModelContract \
        //     --contract-version 1.0.0 \
        //     --tsconfig tsconfig.json \
        //     --output-path ./infrastructure/chaincode`);
       await compileContract("./tests/assets/contract/test", "TestModelContract", "1.0.0","./tsconfig-cc.json", "./docker/infrastructure");
    });


    it("should validate a TestModel instance", () => {
        console.log("Test model contract");
        console.log("Validate a TestModel instance");
    })
})

// describe("Adapter Integration", () => {
//   let adapter1: RamAdapter;
//   let adapter2: RamAdapter;

//   beforeAll(async () => {
//     // First db
//     adapter1 = new RamAdapter("db1");
//     adapter2 = new RamAdapter("db2");


//     // // Second DB
//     // PouchDb.plugin(memoryAdapter);
//     // const db2 = new PouchDb('db2', { adapter: 'memory' });
//     // adapter2 = new PouchAdapter(db2,"db2");
//   });
//   @uses("ram")
//   @model()
//   class TestUser extends BaseModel {
//     @pk({ type: "Number" })
//     id!: number;

//     @required()
//     @min(18)
//     @index([OrderDirection.DSC, OrderDirection.ASC])
//     age!: number;

//     @required()
//     @minlength(5)
//     name!: string;

//     @required()
//     @readonly()
//     @type([String.name])
//     sex!: "M" | "F";

//     constructor(arg?: ModelArg<TestUser>) {
//       super(arg);
//     }
//   }


//   it("Create and read on multiple DBs", async () => {
//     const repo1 = new Repository(adapter1,TestUser)
    
//     const model1 = new TestUser({
//           age: 20,
//           name: "User1" ,
//           sex: "M",
//         })

//     const created1 = await repo1.create(model1);
//     expect(created1).toBeDefined();
//     expect(!created1.hasErrors()).toBe(true);

//     const repo2 = new Repository(adapter2,TestUser)
    
//     const model2 = new TestUser({
//           age: 21,
//           name: "User2" ,
//           sex: "F",
//         })

//     const created2 = await repo2.create(model2);
//     expect(created2).toBeDefined();
//     expect(!created2.hasErrors()).toBe(true);

//     const result1 = await repo1.read(created1.id);
//     expect(created1).toEqual(result1);

//     const result2 = await repo2.read(created2.id);
//     expect(created2).toEqual(result2);

//   });
// });

