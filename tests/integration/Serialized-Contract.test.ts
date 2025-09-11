import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { TestModel } from "../assets/contract/serialized-contract/TestModel";
import { createCompositeKey, randomName, randomNif } from "../utils";
import { modelToTransient, transient } from "@decaf-ts/db-decorators";
import { Model } from "@decaf-ts/decorator-validation";

jest.setTimeout(5000000);

describe("Test Serialized Crud Contract", () => {
  // This ensures the infrastructure is up and running before running the tests.
  beforeAll(async () => {
    // Compile/Transpile the contract to JavaScript
    execSync(
      `npx weaver compile-contract -d --contract-file ./tests/assets/contract/serialized-contract/index.ts --output-dir ./docker/infrastructure/chaincode`
    );

    // Copy necessary files to the chaincode directory
    fs.copyFileSync(
      path.join(
        process.cwd(),
        "./tests/assets/contract/serialized-contract/package.json"
      ),
      path.join(process.cwd(), "./docker/infrastructure/chaincode/package.json")
    );
    fs.copyFileSync(
      path.join(
        process.cwd(),
        "./tests/assets/contract/serialized-contract/npm-shrinkwrap.json"
      ),
      path.join(
        process.cwd(),
        "./docker/infrastructure/chaincode/npm-shrinkwrap.json"
      )
    );

    //Boot infrastructure for testing
    execSync(`npm run infrastructure:up`);
  });

  const ensureReadiness = async () => {
    try {
      // Prepare the JSON argument for the chaincode
      const chaincodeArgs = JSON.stringify({
        function: "healthcheck",
        Args: [],
      });

      // Invoke the chaincode
      const res = execSync(
        `docker exec org-a-peer-0 peer chaincode query \
          -C simple-channel \
          -n simple \
          -c '${chaincodeArgs}' \
          --tls --cafile /weaver/peer/tls-ca-cert.pem`
      );

      return res.toString();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      console.log("Chaincode not ready. Retrying...");
      await new Promise((r) => setTimeout(r, 5000)); // Wait for 5 seconds before retrying
      return ensureReadiness();
    }
  };

  const trim = (str: string) => {
    console.warn("Contract not trimming response properly: ", str);
    return str.trim();
  };

  const invokeChaincode = async (
    functionName: string,
    args: any[],
    transient: any = {}
  ) => {
    // Prepare the JSON argument for the chaincode
    const chaincodeArgs = JSON.stringify({
      function: functionName,
      Args: args,
    });

    const transientData = JSON.stringify(transient);

    // Invoke the chaincode
    return execSync(
      `docker exec org-a-peer-0 peer chaincode invoke \
      -C simple-channel \
      -n simple \
      -c '${chaincodeArgs}' \
      --peerAddresses org-a-peer-0:7031 \
      --tlsRootCertFiles /weaver/peer/tls-ca-cert.pem \
      --peerAddresses org-b-peer-0:7032 \
      --tlsRootCertFiles /weaver/peer/org-b-tls-ca-cert.pem \
      --peerAddresses org-c-peer-0:7033 \
      --tlsRootCertFiles /weaver/peer/org-c-tls-ca-cert.pem \
      -o org-a-orderer-0:7021 \
      --tls --cafile /weaver/peer/tls-ca-cert.pem \
      --transient '${transientData}'`
    );
  };

  const readBlockChain = async (functionName: string, args: any[]) => {
    try {
      // Prepare the JSON argument for the chaincode
      const chaincodeArgs = JSON.stringify({
        function: functionName,
        Args: args,
      });

      // Invoke the chaincode
      const res = execSync(
        `docker exec org-a-peer-0 peer chaincode query \
          -C simple-channel \
          -n simple \
          -c '${chaincodeArgs}' \
          --tls --cafile /weaver/peer/tls-ca-cert.pem`
      );

      const processed = res.toString();
      console.log("Blockchain read:", processed);

      return processed;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      console.log("Failed to read blockchain");
      return "";
    }
  };

  const readByPass = async (id: string, privatedata: boolean = false) => {
    let record;
    try {
      record = await readBlockChain(
        privatedata ? "readPrivateByPass" : "readByPass",
        [createCompositeKey(modelTableName, [String(id)])]
      );
    } catch (error) {
      expect(error).toBeUndefined();
    }
    console.log("Retrieved model: ", record);
    record = JSON.parse(record);
    return record;
  };

  const getData = async () => {
    return {
      name: randomName(6),
      nif: randomNif(9),
    };
  };

  const getCurrentId = async () => {
    let sequence;
    try {
      sequence = await readBlockChain("readByPass", [
        createCompositeKey(sequenceTableName, [sequenceId]),
      ]);
    } catch (error) {
      expect(error).toBeUndefined();
    }
    console.log("Model created successfully: ", sequence);
    sequence = JSON.parse(sequence);
    expect(sequence.id).toBe(sequenceId);
    expect(sequence.current).toBeGreaterThan(0);
    return sequence.current;
  };

  const sequenceTableName = "??sequence";
  const modelTableName = "tst_user";
  const sequenceId = "TestModel_pk";

  it("Boosts infrastructure", async () => {
    console.log("Booting infrastructure...");
    const ready = await ensureReadiness();
    console.log("Infrastructure booted successfully");

    expect(ready).toBeDefined();
  });

  it("Should initialize contract if not initialized", async () => {
    let ready = await ensureReadiness();

    if (trim(ready) === "false") {
      try {
        await invokeChaincode("init", []);
      } catch (error) {
        console.error("Error initializing contract:", error);
        expect(error).toBeUndefined();
      }
    }

    // FOR SOME REASON THE TRIM INSIDE THE CONTRACT IS NOT WORKING
    ready = await ensureReadiness();
    expect(trim(ready)).toBe("true");
  });

  it("Should create model", async () => {
    // Ensure contract is initialized
    const ready = await ensureReadiness();
    expect(trim(ready)).toBe("true");

    const model = new TestModel(await getData());
    console.log("Using model: ", model.serialize());

    const transientData = modelToTransient(model);
    const encoded = Buffer.from(
      Model.build(
        transientData.transient,
        transientData.model.constructor.name
      ).serialize()
    ).toString("base64");

    const transient = {
      [modelTableName]: encoded,
    };

    try {
      await invokeChaincode(
        "create",
        [transientData.model.serialize()],
        transient
      );
    } catch (e) {
      expect(e).toBeUndefined();
    }

    //Giving some time for the transaction to be committed
    await new Promise((r) => setTimeout(r, 15000)); // Wait for 5 seconds before retrying

    const id = await getCurrentId();

    const record = await readByPass(id);

    expect(record["tst_name"]).toBe(model.name);
    expect(record["tst_nif"]).toBe(model.nif);
  });

  // it("Should fail to create model", async () => {
  //   const ready = await ensureReadiness();

  //   expect(trim(ready)).toBe("true");

  //   const data = { name: randomName(6), nif: randomNif(9), id: 1 };
  //   const model = new TestModel(data);

  //   console.log("Using model: ", model.serialize());

  //   let err = false;

  //   try {
  //     await invokeChaincode("create", [model.serialize()]);
  //   } catch (e) {
  //     expect(e).toBeDefined();
  //     err = true;
  //   }

  //   expect(err).toBe(true);
  // });

  // it("Should read model", async () => {
  //   const ready = await ensureReadiness();

  //   expect(trim(ready)).toBe("true");

  //   const data = { name: randomName(6), nif: randomNif(9) };
  //   const model = new TestModel(data);

  //   console.log("Using model: ", model.serialize());

  //   try {
  //     await invokeChaincode("create", [model.serialize()]);
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

  //   let record;
  //   try {
  //     record = await readBlockChain("read", [String(sequence1.current)]);
  //   } catch (error) {
  //     expect(error).toBeUndefined();
  //   }

  //   console.log("Retrieved model: ", record);

  //   record = JSON.parse(record);

  //   expect(record.name).toBe(model.name);
  //   expect(record.nif).toBe(model.nif);
  // });

  // it("Should update model", async () => {
  //   const ready = await ensureReadiness();

  //   expect(trim(ready)).toBe("true");

  //   const data = { name: randomName(6), nif: randomNif(9) };
  //   const model = new TestModel(data);

  //   console.log("Using model: ", model.serialize());

  //   try {
  //     await invokeChaincode("create", [model.serialize()]);
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

  //   let record;
  //   try {
  //     record = await readBlockChain("read", [String(sequence1.current)]);
  //   } catch (error) {
  //     expect(error).toBeUndefined();
  //   }

  //   console.log("Retrieved model: ", record);

  //   record = JSON.parse(record);

  //   expect(record.name).toBe(model.name);
  //   expect(record.nif).toBe(model.nif);

  //   model.name = randomName(6);
  //   model.nif = randomNif(9);
  //   model.id = sequence1.current;

  //   console.log("Using model: ", model.serialize());

  //   try {
  //     await invokeChaincode("update", [model.serialize()]);
  //   } catch (e) {
  //     expect(e).toBeUndefined();
  //   }

  //   //Giving some time for the transaction to be committed
  //   await new Promise((r) => setTimeout(r, 15000)); // Wait for 5 seconds before retrying

  //   let record1;
  //   try {
  //     record1 = await readBlockChain("read", [String(sequence1.current)]);
  //   } catch (error) {
  //     expect(error).toBeUndefined();
  //   }

  //   console.log("Retrieved model: ", record1);

  //   record1 = JSON.parse(record1);

  //   expect(record1.name).toBe(model.name);
  //   expect(record1.nif).toBe(model.nif);
  //   expect(record1.name).not.toBe(record.name);
  //   expect(record1.nif).not.toBe(record.nif);
  // });

  // it("Should fail update model", async () => {
  //   const ready = await ensureReadiness();

  //   expect(trim(ready)).toBe("true");

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

  //   const data = {
  //     name: randomName(6),
  //     nif: randomNif(9),
  //     id: sequence1.current + 10,
  //   };
  //   const model = new TestModel(data);

  //   console.log("Using model: ", model.serialize());

  //   let err = false;
  //   try {
  //     await invokeChaincode("update", [model.serialize()]);
  //   } catch (e) {
  //     expect(e).toBeDefined();
  //     err = true;
  //   }

  //   expect(err).toBe(true);
  // });

  // it("Should delete model", async () => {
  //   const ready = await ensureReadiness();

  //   expect(trim(ready)).toBe("true");

  //   const data = { name: randomName(6), nif: randomNif(9) };
  //   const model = new TestModel(data);

  //   console.log("Using model: ", model.serialize());

  //   try {
  //     await invokeChaincode("create", [model.serialize()]);
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

  //   let record;
  //   try {
  //     record = await readBlockChain("read", [String(sequence1.current)]);
  //   } catch (error) {
  //     expect(error).toBeUndefined();
  //   }

  //   console.log("Retrieved model: ", record);

  //   record = JSON.parse(record);

  //   expect(record.name).toBe(model.name);
  //   expect(record.nif).toBe(model.nif);

  //   try {
  //     await invokeChaincode("delete", [String(sequence1.current)]);
  //   } catch (e) {
  //     expect(e).toBeUndefined();
  //   }

  //   //Giving some time for the transaction to be committed
  //   await new Promise((r) => setTimeout(r, 15000)); // Wait for 5 seconds before retrying

  //   let record1;
  //   try {
  //     record1 = await readBlockChain("read", [String(sequence1.current)]);
  //   } catch (error) {
  //     expect(error).toBeUndefined();
  //   }

  //   console.log("Retrieved model: ", record1);

  //   expect(record1).toBe("");
  // });

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
});
