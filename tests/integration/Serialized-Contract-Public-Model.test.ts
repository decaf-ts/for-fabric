import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  commitChaincode,
  compileContract,
  createCompositeKey,
  deployContract,
  ensureContractReadiness,
  ensureInfrastructureBooted,
  invokeChaincode,
  queryChaincode,
  randomName,
  randomNif,
  trim,
} from "../utils";
import { TestModel } from "../assets/contract/serialized-contract-public-model/TestModel";
import { Model } from "@decaf-ts/decorator-validation";
// import { createCompositeKey, randomName, randomNif } from "../utils";

jest.setTimeout(5000000);

describe("Test Serialized Crud Contract With Public Model", () => {
  const contractFolderName = "serialized-contract-public-model";
  const contractName = "TestPublicModel";
  const sequenceTableName = "??sequence";
  const modelTableName = "tst_user";
  const sequenceId = "TestModel_pk";

  const getData = () => {
    return {
      name: randomName(6),
      nif: randomNif(9),
    };
  };

  const getCurrentId = (collection: string = "none") => {
    let sequence;

    const args = [
      createCompositeKey(sequenceTableName, [sequenceId]),
      collection,
    ].filter((el) => el !== undefined);

    try {
      sequence = queryChaincode(contractName, "readByPass", args);
    } catch (error) {
      expect(error).toBeUndefined();
    }
    console.log("Model created successfully: ", sequence);

    expect(sequence).toBeDefined();
    sequence = JSON.parse(sequence!);
    expect(sequence.id).toBe(sequenceId);
    expect(sequence.current).toBeGreaterThan(0);

    return sequence.current;
  };

  beforeAll(async () => {
    //Boot infrastructure for testing
    execSync(`npm run infrastructure:up`);

    //Ensure Infrastructure is ready
    await ensureInfrastructureBooted();

    // Check if contract folder exists and compile it if not
    if (
      fs.existsSync(
        path.join(
          __dirname,
          "../../docker/infrastructure/chaincode",
          contractFolderName
        )
      )
    ) {
      console.log("Contract folder already exists");
      return;
    }

    // Compile contract
    compileContract(contractFolderName);

    //Deploy contract
    deployContract(contractFolderName, contractName);

    // Commit Chaincode
    commitChaincode(contractName);
  });

  it("Deploys contract corretly", async () => {
    const ready = await ensureContractReadiness(contractName);
    expect(ready).toBeDefined();
  });

  it("Should initialize contract", async () => {
    const ready = await ensureContractReadiness(contractName);

    if (trim(ready) === "false") {
      try {
        console.log("Initializing contract...");
        invokeChaincode(contractName, "init", []);
      } catch (error: any) {
        console.error("Error initializing contract:", error);
        expect(error).toBeUndefined();
      }
    }

    const readyCheck = await ensureContractReadiness(contractName);
    expect(trim(readyCheck)).toBe("true");
  });

  it("Should create model", async () => {
    // Ensure contract is initialized
    const ready = await ensureContractReadiness(contractName);
    expect(trim(ready)).toBe("true");

    const model = new TestModel(getData());
    console.log("Using model: ", model.serialize());

    try {
      invokeChaincode(contractName, "create", [model.serialize()]);
    } catch (e) {
      expect(e).toBeUndefined();
    }

    //Giving some time for the transaction to be committed
    await new Promise((r) => setTimeout(r, 15000)); // Wait for 15 seconds before retrying

    let id = undefined;

    try {
      id = getCurrentId();
    } catch (error: any) {
      expect(error).toBeUndefined();
    }

    expect(id).toBeDefined();

    try {
      const args = [createCompositeKey(modelTableName, [String(id)]), "none"];
      let record = queryChaincode(contractName, "readByPass", args) as any;
      expect(record).toBeDefined();

      record = JSON.parse(record.toString());

      expect(record["tst_name"]).toBe(model.name);
      expect(record["tst_nif"]).toBe(model.nif);
      expect(record.id).toBe(id);
    } catch (error: any) {
      expect(error).toBeUndefined();
    }
  });

  it("Should create model with transient data", async () => {
    // Ensure contract is initialized
    const ready = await ensureContractReadiness(contractName);
    expect(trim(ready)).toBe("true");

    const data = getData();

    const model = new TestModel({ name: data.name });
    console.log("Using model: ", model.serialize());

    const encoded = Buffer.from(
      Model.build({ nif: data.nif }, model.constructor.name).serialize()
    ).toString("base64");

    const transient = {
      [modelTableName]: encoded,
    };

    try {
      invokeChaincode(contractName, "create", [model.serialize()], transient);
    } catch (e) {
      expect(e).toBeUndefined();
    }

    //Giving some time for the transaction to be committed
    await new Promise((r) => setTimeout(r, 15000)); // Wait for 15 seconds before retrying

    let id = undefined;

    try {
      id = getCurrentId();
    } catch (error: any) {
      expect(error).toBeUndefined();
    }

    expect(id).toBeDefined();

    try {
      const args = [createCompositeKey(modelTableName, [String(id)]), "none"];
      let record = queryChaincode(contractName, "readByPass", args) as any;
      expect(record).toBeDefined();

      record = JSON.parse(record.toString());

      expect(record["tst_name"]).toBe(data.name);
      expect(record["tst_nif"]).toBe(data.nif);
      expect(record.id).toBe(id);
    } catch (error: any) {
      expect(error).toBeUndefined();
    }
  });

  it("Should fail to create model with existing id", async () => {
    // Ensure contract is initialized
    const ready = await ensureContractReadiness(contractName);
    expect(trim(ready)).toBe("true");

    const id = 1;

    const model = new TestModel({ ...getData(), id: id });
    console.log("Using model: ", model.serialize());

    let error = false;
    try {
      invokeChaincode(contractName, "create", [model.serialize()]);
    } catch (e: unknown) {
      error = true;
      expect(e).toBeDefined();
      expect((e as any).message).toContain(
        `[ConflictError] Conflict detected while creating model with id: ${id} already exists`
      );
    }

    expect(error).toBe(true);
  });

  it("Should read model", async () => {
    // Ensure contract is initialized
    const ready = await ensureContractReadiness(contractName);
    expect(trim(ready)).toBe("true");

    const model = new TestModel(getData());
    console.log("Using model: ", model.serialize());

    try {
      invokeChaincode(contractName, "create", [model.serialize()]);
    } catch (e) {
      expect(e).toBeUndefined();
    }

    //Giving some time for the transaction to be committed
    await new Promise((r) => setTimeout(r, 15000)); // Wait for 15 seconds before retrying

    let id = undefined;

    try {
      id = getCurrentId();
    } catch (error: any) {
      expect(error).toBeUndefined();
    }

    expect(id).toBeDefined();

    try {
      const args = [String(id)];
      let record = queryChaincode(contractName, "read", args) as any;
      expect(record).toBeDefined();

      record = JSON.parse(record.toString());

      expect(record.name).toBe(model.name);
      expect(record.nif).toBe(model.nif);
      expect(record.id).toBe(id);
    } catch (error: any) {
      expect(error).toBeUndefined();
    }
  });

  it("Should fail to read model with non-existing id", async () => {
    // Ensure contract is initialized
    const ready = await ensureContractReadiness(contractName);
    expect(trim(ready)).toBe("true");

    const model = new TestModel(getData());
    console.log("Using model: ", model.serialize());

    const id = 1000000000;

    let error = false;

    try {
      const args = [String(id)];
      queryChaincode(contractName, "read", args) as any;
    } catch (err: any) {
      error = true;
      expect(err).toBeDefined();
      expect(err.message).toContain(
        `[NotFoundError] Record with id ${id} not found`
      );
    }

    expect(error).toBe(true);
  });

  it("Should update model", async () => {
    // Ensure contract is initialized
    const ready = await ensureContractReadiness(contractName);
    expect(trim(ready)).toBe("true");

    const model = new TestModel(getData());
    console.log("Using model: ", model.serialize());

    try {
      invokeChaincode(contractName, "create", [model.serialize()]);
    } catch (e) {
      expect(e).toBeUndefined();
    }

    //Giving some time for the transaction to be committed
    await new Promise((r) => setTimeout(r, 15000)); // Wait for 15 seconds before retrying

    let id = undefined;

    try {
      id = getCurrentId();
    } catch (error: any) {
      expect(error).toBeUndefined();
    }

    expect(id).toBeDefined();

    try {
      const args = [String(id)];
      let record = queryChaincode(contractName, "read", args) as any;
      expect(record).toBeDefined();

      record = JSON.parse(record.toString());

      expect(record.name).toBe(model.name);
      expect(record.nif).toBe(model.nif);
      expect(record.id).toBe(id);
    } catch (error: any) {
      expect(error).toBeUndefined();
    }
    const newModel = new TestModel(getData());
    newModel.id = id;

    console.log("Using model: ", newModel.serialize());

    try {
      invokeChaincode(contractName, "update", [newModel.serialize()]);
    } catch (e) {
      expect(e).toBeUndefined();
    }

    //Giving some time for the transaction to be committed
    await new Promise((r) => setTimeout(r, 15000)); // Wait for 15 seconds before retrying

    try {
      const args = [String(id)];
      let record = queryChaincode(contractName, "read", args) as any;
      expect(record).toBeDefined();

      record = JSON.parse(record.toString());

      expect(record.name).toBe(newModel.name);
      expect(record.nif).toBe(newModel.nif);
      expect(record.name).not.toBe(model.name);
      expect(record.nif).not.toBe(model.nif);
      expect(record.id).toBe(id);
    } catch (error: any) {
      expect(error).toBeUndefined();
    }
  });

  it("Should update model with transient data", async () => {
    // Ensure contract is initialized
    const ready = await ensureContractReadiness(contractName);
    expect(trim(ready)).toBe("true");

    const data = getData();

    const model = new TestModel({ name: data.name });
    console.log("Using model: ", model.serialize());

    const encoded = Buffer.from(
      Model.build({ nif: data.nif }, model.constructor.name).serialize()
    ).toString("base64");

    const transient = {
      [modelTableName]: encoded,
    };

    try {
      invokeChaincode(contractName, "create", [model.serialize()], transient);
    } catch (e) {
      expect(e).toBeUndefined();
    }

    //Giving some time for the transaction to be committed
    await new Promise((r) => setTimeout(r, 15000)); // Wait for 15 seconds before retrying

    let id = undefined;

    try {
      id = getCurrentId();
    } catch (error: any) {
      expect(error).toBeUndefined();
    }

    expect(id).toBeDefined();

    try {
      const args = [String(id)];
      let record = queryChaincode(contractName, "read", args) as any;
      expect(record).toBeDefined();

      record = JSON.parse(record.toString());

      expect(record.name).toBe(data.name);
      expect(record.nif).toBe(data.nif);
      expect(record.id).toBe(id);
    } catch (error: any) {
      expect(error).toBeUndefined();
    }

    const data1 = getData();

    const newModel = new TestModel({ name: data1.name });
    console.log("Using model: ", newModel.serialize());

    const encoded1 = Buffer.from(
      Model.build({ nif: data1.nif }, newModel.constructor.name).serialize()
    ).toString("base64");

    const transient1 = {
      [modelTableName]: encoded1,
    };

    newModel.id = id;

    console.log("Using model: ", newModel.serialize());

    try {
      invokeChaincode(
        contractName,
        "update",
        [newModel.serialize()],
        transient1
      );
    } catch (e) {
      expect(e).toBeUndefined();
    }

    //Giving some time for the transaction to be committed
    await new Promise((r) => setTimeout(r, 15000)); // Wait for 15 seconds before retrying

    try {
      const args = [String(id)];
      let record = queryChaincode(contractName, "read", args) as any;
      expect(record).toBeDefined();

      record = JSON.parse(record.toString());

      expect(record.name).toBe(data1.name);
      expect(record.nif).toBe(data1.nif);
      expect(record.name).not.toBe(model.name);
      expect(record.nif).not.toBe(model.nif);
      expect(record.id).toBe(id);
    } catch (error: any) {
      expect(error).toBeUndefined();
    }
  });

  it("Should fail to update model with non-existing id", async () => {
    // Ensure contract is initialized
    const ready = await ensureContractReadiness(contractName);
    expect(trim(ready)).toBe("true");

    const model = new TestModel(getData());
    console.log("Using model: ", model.serialize());

    const id = 10000000000;

    model.id = id;

    let error = false;

    try {
      invokeChaincode(contractName, "update", [model.serialize()]);
    } catch (e) {
      error = true;
      expect(e).toBeDefined();
      expect((e as any).message).toContain(
        `[NotFoundError] Record with id ${id} not found`
      );
    }

    expect(error).toBe(true);
  });

  it("Should delete model", async () => {
    // Ensure contract is initialized
    const ready = await ensureContractReadiness(contractName);
    expect(trim(ready)).toBe("true");

    const model = new TestModel(getData());
    console.log("Using model: ", model.serialize());

    try {
      invokeChaincode(contractName, "create", [model.serialize()]);
    } catch (e) {
      expect(e).toBeUndefined();
    }

    //Giving some time for the transaction to be committed
    await new Promise((r) => setTimeout(r, 15000)); // Wait for 15 seconds before retrying

    let id = undefined;

    try {
      id = getCurrentId();
    } catch (error: any) {
      expect(error).toBeUndefined();
    }

    expect(id).toBeDefined();

    try {
      const args = [String(id)];
      let record = queryChaincode(contractName, "read", args) as any;
      expect(record).toBeDefined();

      record = JSON.parse(record.toString());

      expect(record.name).toBe(model.name);
      expect(record.nif).toBe(model.nif);
      expect(record.id).toBe(id);
    } catch (error: any) {
      expect(error).toBeUndefined();
    }

    try {
      invokeChaincode(contractName, "delete", [String(id)]);
    } catch (e) {
      expect(e).toBeUndefined();
    }

    //Giving some time for the transaction to be committed
    await new Promise((r) => setTimeout(r, 15000)); // Wait for 15 seconds before retrying

    let error = false;
    try {
      const args = [String(id)];
      queryChaincode(contractName, "read", args) as any;
    } catch (err: any) {
      error = true;
      expect(err).toBeDefined();
      expect(err.message).toContain(
        `[NotFoundError] Record with id ${id} not found`
      );
    }

    expect(error).toBe(true);
  });

  it("Should fail to delete model with non-existing id", async () => {
    // Ensure contract is initialized
    const ready = await ensureContractReadiness(contractName);
    expect(trim(ready)).toBe("true");

    const id = 10000000000;

    let error = false;

    try {
      invokeChaincode(contractName, "delete", [String(id)]);
    } catch (e: any) {
      expect(e).toBeDefined();
      error = true;
      expect(e.message).toContain(
        `[NotFoundError] Record with id ${id} not found`
      );
    }

    expect(error).toBe(true);
  });

  it("Should raw", async () => {
    // Ensure contract is initialized
    const ready = await ensureContractReadiness(contractName);
    expect(trim(ready)).toBe("true");

    const model = new TestModel(getData());
    console.log("Using model: ", model.serialize());

    try {
      invokeChaincode(contractName, "create", [model.serialize()]);
    } catch (e) {
      expect(e).toBeUndefined();
    }

    //Giving some time for the transaction to be committed
    await new Promise((r) => setTimeout(r, 15000)); // Wait for 15 seconds before retrying

    let id = undefined;

    try {
      id = getCurrentId();
    } catch (error: any) {
      expect(error).toBeUndefined();
    }

    expect(id).toBeDefined();

    const mango = {
      selector: {
        id: id,
      },
    };

    try {
      const args = [JSON.stringify(mango), String(true)];
      let record = queryChaincode(contractName, "raw", args) as any;
      expect(record).toBeDefined();

      record = JSON.parse(record.toString());
      console.log("Raw response: ", record);

      const key = createCompositeKey(modelTableName, [String(id)]);

      const result = record[0];
      const resultModel = result.Record;

      expect(result).toBeDefined();
      expect(result.Key).toBe(key);
      expect(resultModel["tst_name"]).toEqual(model.name);
      expect(resultModel["tst_nif"]).toEqual(model.nif);
    } catch (error: any) {
      expect(error).toBeUndefined();
    }
  });
});

// it("Should createAll models", async () => {
//   const ready = await ensureReadiness();

//   expect(trim(ready)).toBe("true");

//   const data = [
//     { name: randomName(6), nif: randomNif(9) },
//     { name: randomName(6), nif: randomNif(9) },
//     { name: randomName(6), nif: randomNif(9) },
//   ];
//   const models = data.map((d) => new TestModel(d));
//   const serializedModels = models.map((m) => m.serialize());

//   console.log("Using models: ", models.map((m) => m.serialize()).join(", "));

//   try {
//     await invokeChaincode("createAll", [JSON.stringify(serializedModels)]);
//   } catch (e) {
//     expect(e).toBeUndefined();
//   }

//   //Giving some time for the transaction to be committed
//   await new Promise((r) => setTimeout(r, 15000)); // Wait for 5 seconds before retrying

//   let sequence1;

//   try {
//     sequence1 = await readBlockChain("readByPass", [
//       createCompositeKey(sequenceTableName, [sequenceId]),
//     ]);
//   } catch (error) {
//     expect(error).toBeUndefined();
//   }

//   console.log("Model created successfully: ", sequence1);

//   sequence1 = JSON.parse(sequence1);

//   expect(sequence1.id).toBe(sequenceId);
//   expect(sequence1.current).toBeGreaterThan(0);

//   const id1 = sequence1.current;
//   const id2 = sequence1.current - 1;
//   const id3 = sequence1.current - 2;

//   let record1;
//   try {
//     record1 = await readBlockChain("read", [String(id1)]);
//   } catch (error) {
//     expect(error).toBeUndefined();
//   }

//   console.log("Retrieved model: ", record1);
//   record1 = JSON.parse(record1);

//   const filter1 = data.filter((m) => {
//     console.log(m.name, record1.name); // Debugging
//     return m.name === record1.name;
//   });

//   expect(filter1.length).toBe(1);
//   expect(filter1[0].nif).toBe(record1.nif);
//   expect(filter1[0].name).toBe(record1.name);

//   let record2;
//   try {
//     record2 = await readBlockChain("read", [String(id2)]);
//   } catch (error) {
//     expect(error).toBeUndefined();
//   }

//   console.log("Retrieved model: ", record2);

//   record2 = JSON.parse(record2);

//   const filter2 = data.filter((m) => m.name === record2.name);

//   expect(filter2.length).toBe(1);
//   expect(filter2[0].nif).toBe(record2.nif);
//   expect(filter2[0].name).toBe(record2.name);

//   let record3;
//   try {
//     record3 = await readBlockChain("read", [String(id3)]);
//   } catch (error) {
//     expect(error).toBeUndefined();
//   }

//   console.log("Retrieved model: ", record3);

//   record3 = JSON.parse(record3);

//   const filter3 = data.filter((m) => m.name === record3.name);

//   expect(filter3.length).toBe(1);
//   expect(filter3[0].nif).toBe(record3.nif);
//   expect(filter3[0].name).toBe(record3.name);
// });

// it("Should readAll models", async () => {
//   const ready = await ensureReadiness();

//   expect(trim(ready)).toBe("true");

//   const data = [
//     { name: randomName(6), nif: randomNif(9) },
//     { name: randomName(6), nif: randomNif(9) },
//     { name: randomName(6), nif: randomNif(9) },
//   ];
//   const models = data.map((d) => new TestModel(d));
//   const serializedModels = models.map((m) => m.serialize());

//   console.log("Using models: ", models.map((m) => m.serialize()).join(", "));

//   try {
//     await invokeChaincode("createAll", [JSON.stringify(serializedModels)]);
//   } catch (e) {
//     expect(e).toBeUndefined();
//   }

//   //Giving some time for the transaction to be committed
//   await new Promise((r) => setTimeout(r, 15000)); // Wait for 5 seconds before retrying

//   let sequence1;

//   try {
//     sequence1 = await readBlockChain("readByPass", [
//       createCompositeKey(sequenceTableName, [sequenceId]),
//     ]);
//   } catch (error) {
//     expect(error).toBeUndefined();
//   }

//   console.log("Model created successfully: ", sequence1);

//   sequence1 = JSON.parse(sequence1);

//   expect(sequence1.id).toBe(sequenceId);
//   expect(sequence1.current).toBeGreaterThan(0);

//   const id1 = sequence1.current;
//   const id2 = sequence1.current - 1;
//   const id3 = sequence1.current - 2;

//   const ids = JSON.stringify([id1, id2, id3]);

//   let records;
//   try {
//     records = await readBlockChain("readAll", [ids]);
//   } catch (error) {
//     expect(error).toBeUndefined();
//   }

//   records = JSON.parse(records).map((r) => new TestModel(JSON.parse(r)));

//   expect(records.length).toBe(3);

//   for (const record of records) {
//     const filter1 = data.filter((m) => m.name === record.name);
//     expect(record).not.toBeNull();
//     expect(record).not.toBeUndefined();
//     expect(filter1.length).toBe(1);
//     expect(filter1[0].nif).toBe(record.nif);
//     expect(filter1[0].name).toBe(record.name);
//   }
// });

// it("Should updateAll models", async () => {
//   const ready = await ensureReadiness();

//   expect(trim(ready)).toBe("true");

//   const data = [
//     { name: randomName(6), nif: randomNif(9) },
//     { name: randomName(6), nif: randomNif(9) },
//     { name: randomName(6), nif: randomNif(9) },
//   ];
//   const models = data.map((d) => new TestModel(d));
//   const serializedModels = models.map((m) => m.serialize());

//   console.log("Using models: ", models.map((m) => m.serialize()).join(", "));

//   try {
//     await invokeChaincode("createAll", [JSON.stringify(serializedModels)]);
//   } catch (e) {
//     expect(e).toBeUndefined();
//   }

//   //Giving some time for the transaction to be committed
//   await new Promise((r) => setTimeout(r, 15000)); // Wait for 5 seconds before retrying

//   let sequence1;

//   try {
//     sequence1 = await readBlockChain("readByPass", [
//       createCompositeKey(sequenceTableName, [sequenceId]),
//     ]);
//   } catch (error) {
//     expect(error).toBeUndefined();
//   }

//   console.log("Model created successfully: ", sequence1);

//   sequence1 = JSON.parse(sequence1);

//   expect(sequence1.id).toBe(sequenceId);
//   expect(sequence1.current).toBeGreaterThan(0);

//   const id1 = sequence1.current;
//   const id2 = sequence1.current - 1;
//   const id3 = sequence1.current - 2;

//   const ids = JSON.stringify([id1, id2, id3]);

//   let records;
//   try {
//     records = await readBlockChain("readAll", [ids]);
//   } catch (error) {
//     expect(error).toBeUndefined();
//   }

//   records = JSON.parse(records).map((r) => new TestModel(JSON.parse(r)));

//   expect(records.length).toBe(3);

//   for (const record of records) {
//     const filter1 = data.filter((m) => m.name === record.name);
//     expect(record).not.toBeNull();
//     expect(record).not.toBeUndefined();
//     expect(filter1.length).toBe(1);
//     expect(filter1[0].nif).toBe(record.nif);
//     expect(filter1[0].name).toBe(record.name);
//   }

//   records = records.map((m) => new TestModel({ ...m, name: randomName(6) }));

//   records.forEach((record) => {
//     console.log("Updating model: ", record.serialize());
//   });

//   const preparedRecords = records.map((m) => m.serialize());

//   try {
//     await invokeChaincode("updateAll", [JSON.stringify(preparedRecords)]);
//   } catch (e) {
//     expect(e).toBeUndefined();
//   }

//   //Giving some time for the transaction to be committed
//   await new Promise((r) => setTimeout(r, 15000)); // Wait for 5 seconds before retrying

//   let records1;
//   try {
//     records1 = await readBlockChain("readAll", [ids]);
//   } catch (error) {
//     expect(error).toBeUndefined();
//   }

//   records1 = JSON.parse(records1).map((r) => new TestModel(JSON.parse(r)));

//   expect(records1.length).toBe(3);

//   for (const record of records1) {
//     const filter1 = records.filter((m) => m.name === record.name);
//     expect(record).not.toBeNull();
//     expect(record).not.toBeUndefined();
//     expect(filter1.length).toBe(1);
//     expect(filter1[0].nif).toBe(record.nif);
//     expect(filter1[0].name).toBe(record.name);

//     const filter2 = data.filter((m) => m.nif === record.nif);
//     expect(filter2.length).toBe(1);
//     expect(filter2[0].nif).toBe(record.nif);
//     expect(filter2[0].name).not.toBe(record.name);
//   }
// });

// it("Should deleteAll models", async () => {
//   const ready = await ensureReadiness();

//   expect(trim(ready)).toBe("true");

//   const data = [
//     { name: randomName(6), nif: randomNif(9) },
//     { name: randomName(6), nif: randomNif(9) },
//     { name: randomName(6), nif: randomNif(9) },
//   ];
//   const models = data.map((d) => new TestModel(d));
//   const serializedModels = models.map((m) => m.serialize());

//   console.log("Using models: ", models.map((m) => m.serialize()).join(", "));

//   try {
//     await invokeChaincode("createAll", [JSON.stringify(serializedModels)]);
//   } catch (e) {
//     expect(e).toBeUndefined();
//   }

//   //Giving some time for the transaction to be committed
//   await new Promise((r) => setTimeout(r, 15000)); // Wait for 5 seconds before retrying

//   let sequence1;

//   try {
//     sequence1 = await readBlockChain("readByPass", [
//       createCompositeKey(sequenceTableName, [sequenceId]),
//     ]);
//   } catch (error) {
//     expect(error).toBeUndefined();
//   }

//   console.log("Model created successfully: ", sequence1);

//   sequence1 = JSON.parse(sequence1);

//   expect(sequence1.id).toBe(sequenceId);
//   expect(sequence1.current).toBeGreaterThan(0);

//   const id1 = sequence1.current;
//   const id2 = sequence1.current - 1;
//   const id3 = sequence1.current - 2;

//   let record1;
//   try {
//     record1 = await readBlockChain("read", [String(id1)]);
//   } catch (error) {
//     expect(error).toBeUndefined();
//   }

//   console.log("Retrieved model: ", record1);
//   record1 = JSON.parse(record1);

//   const filter1 = data.filter((m) => {
//     console.log(m.name, record1.name); // Debugging
//     return m.name === record1.name;
//   });

//   expect(filter1.length).toBe(1);
//   expect(filter1[0].nif).toBe(record1.nif);
//   expect(filter1[0].name).toBe(record1.name);

//   let record2;
//   try {
//     record2 = await readBlockChain("read", [String(id2)]);
//   } catch (error) {
//     expect(error).toBeUndefined();
//   }

//   console.log("Retrieved model: ", record2);

//   record2 = JSON.parse(record2);

//   const filter2 = data.filter((m) => m.name === record2.name);

//   expect(filter2.length).toBe(1);
//   expect(filter2[0].nif).toBe(record2.nif);
//   expect(filter2[0].name).toBe(record2.name);

//   let record3;
//   try {
//     record3 = await readBlockChain("read", [String(id3)]);
//   } catch (error) {
//     expect(error).toBeUndefined();
//   }

//   console.log("Retrieved model: ", record3);

//   record3 = JSON.parse(record3);

//   const filter3 = data.filter((m) => m.name === record3.name);

//   expect(filter3.length).toBe(1);
//   expect(filter3[0].nif).toBe(record3.nif);
//   expect(filter3[0].name).toBe(record3.name);

//   const ids = JSON.stringify([id1, id2, id3]);

//   try {
//     await invokeChaincode("deleteAll", [ids]);
//   } catch (e) {
//     expect(e).toBeUndefined();
//   }

//   //Giving some time for the transaction to be committed
//   await new Promise((r) => setTimeout(r, 15000)); // Wait for 5 seconds before retrying

//   let record4;
//   try {
//     record4 = await readBlockChain("read", [String(id1)]);
//   } catch (error) {
//     expect(error).toBeUndefined();
//   }

//   console.log("Retrieved model: ", record4);

//   expect(record4).toBe("");

//   let record5;
//   try {
//     record5 = await readBlockChain("read", [String(id2)]);
//   } catch (error) {
//     expect(error).toBeUndefined();
//   }

//   console.log("Retrieved model: ", record5);

//   expect(record5).toBe("");

//   let record6;
//   try {
//     record6 = await readBlockChain("read", [String(id3)]);
//   } catch (error) {
//     expect(error).toBeUndefined();
//   }

//   console.log("Retrieved model: ", record6);

//   expect(record6).toBe("");
// });
