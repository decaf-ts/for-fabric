/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { FabricCrudContract } from "../../../../src/contracts/crud/crud-contract";
console.log(FabricCrudContract.name);
import { TestModelContract } from "./TestModelContract";

import { Shim, ChaincodeResponse, ChaincodeStub } from "fabric-shim";

class ChaincodeWrapper {
  contract: TestModelContract;

  constructor() {
    this.contract = new TestModelContract();
  }

  async Init(stub: ChaincodeStub): Promise<ChaincodeResponse> {
    return {
      status: 200,
      message: "Init successful",
      payload: Buffer.from(""),
    };
  }

  async Invoke(stub: ChaincodeStub): Promise<ChaincodeResponse> {
    const { fcn, params } = stub.getFunctionAndParameters();

    try {
      let result;
      switch (fcn) {
        case "healthcheck":
          result = await this.contract.healthcheck(stub as any);
          break;
        case "create":
          result = await this.contract.create(stub, ...params);
          break;
        case "createData":
          result = await this.contract.create(stub, ...params);
          break;
        case "read":
          result = await this.contract.read(stub, ...params);
          break;
        default:
          return { status: 400, message: `Unknown function ${fcn}` };
      }

      return {
        status: 200,
        payload: Buffer.from(JSON.stringify(result)),
      };
    } catch (err: any) {
      return {
        status: 500,
        message: err.message,
      };
    }
  }
}

// Start chaincode
try {
  Shim.start(new ChaincodeWrapper());
  console.log("Chaincode started successfully");
} catch (err) {
  console.error(`Error starting chaincode: ${err}`);
  process.exit(1);
}
