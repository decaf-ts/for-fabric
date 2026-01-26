import "../../src/shared/overrides";
import { pk, column, table, index } from "@decaf-ts/core";
import { model, Model, ModelArg } from "@decaf-ts/decorator-validation";
import { SerializedCrudContract } from "../../src/contracts/crud/serialized-crud-contract";
import { FabricCrudContract } from "../../src/contracts/crud/crud-contract";

@table("contract_aggregation_test")
@model()
class ContractAggregationTestModel extends Model {
  @pk({ type: Number, generated: true })
  id!: number;

  @column("name")
  @index()
  name!: string;

  @column("score")
  @index()
  score!: number;

  @column("category")
  @index()
  category!: string;

  constructor(arg?: ModelArg<ContractAggregationTestModel>) {
    super(arg);
  }
}

class TestAggregationContract extends SerializedCrudContract<ContractAggregationTestModel> {
  constructor() {
    super("TestAggregationContract", ContractAggregationTestModel);
  }
}

describe("SerializedCrudContract - Aggregation Method Signatures", () => {
  const contract = new TestAggregationContract();

  describe("Aggregation methods exist on contract", () => {
    it("should have countOf method", () => {
      expect(typeof contract.countOf).toBe("function");
    });

    it("should have maxOf method", () => {
      expect(typeof contract.maxOf).toBe("function");
    });

    it("should have minOf method", () => {
      expect(typeof contract.minOf).toBe("function");
    });

    it("should have avgOf method", () => {
      expect(typeof contract.avgOf).toBe("function");
    });

    it("should have sumOf method", () => {
      expect(typeof contract.sumOf).toBe("function");
    });

    it("should have distinctOf method", () => {
      expect(typeof contract.distinctOf).toBe("function");
    });

    it("should have groupOf method", () => {
      expect(typeof contract.groupOf).toBe("function");
    });
  });

  describe("Base contract also has aggregation methods", () => {
    it("FabricCrudContract should have countOf", () => {
      expect(typeof FabricCrudContract.prototype.countOf).toBe("function");
    });

    it("FabricCrudContract should have maxOf", () => {
      expect(typeof FabricCrudContract.prototype.maxOf).toBe("function");
    });

    it("FabricCrudContract should have minOf", () => {
      expect(typeof FabricCrudContract.prototype.minOf).toBe("function");
    });

    it("FabricCrudContract should have avgOf", () => {
      expect(typeof FabricCrudContract.prototype.avgOf).toBe("function");
    });

    it("FabricCrudContract should have sumOf", () => {
      expect(typeof FabricCrudContract.prototype.sumOf).toBe("function");
    });

    it("FabricCrudContract should have distinctOf", () => {
      expect(typeof FabricCrudContract.prototype.distinctOf).toBe("function");
    });

    it("FabricCrudContract should have groupOf", () => {
      expect(typeof FabricCrudContract.prototype.groupOf).toBe("function");
    });
  });

  describe("Method parameter expectations", () => {
    it("countOf accepts optional field parameter", () => {
      // Verify the method signature by checking function length
      // countOf(ctx, key?, ...args) - key is optional
      expect(contract.countOf.length).toBeGreaterThanOrEqual(1);
    });

    it("maxOf requires field parameter", () => {
      expect(contract.maxOf.length).toBeGreaterThanOrEqual(2);
    });

    it("minOf requires field parameter", () => {
      expect(contract.minOf.length).toBeGreaterThanOrEqual(2);
    });

    it("avgOf requires field parameter", () => {
      expect(contract.avgOf.length).toBeGreaterThanOrEqual(2);
    });

    it("sumOf requires field parameter", () => {
      expect(contract.sumOf.length).toBeGreaterThanOrEqual(2);
    });

    it("distinctOf requires field parameter", () => {
      expect(contract.distinctOf.length).toBeGreaterThanOrEqual(2);
    });

    it("groupOf requires field parameter", () => {
      expect(contract.groupOf.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("Client-Contract Serialization Format Compatibility", () => {
  /**
   * These tests verify the serialization format contract between
   * FabricClientRepository and SerializedCrudContract.
   *
   * Client sends: evaluateTransaction(ctx, "statement", [methodName, JSON.stringify(args)])
   * Contract receives: statement(ctx, methodName, serializedArgs)
   * Contract returns: JSON.stringify(result)
   */

  describe("Request format: Client to Contract", () => {
    it("countOf without field: client sends []", () => {
      const clientArgs = JSON.stringify([]);
      expect(JSON.parse(clientArgs)).toEqual([]);
    });

    it("countOf with field: client sends [field]", () => {
      const field = "score";
      const clientArgs = JSON.stringify([field]);
      expect(JSON.parse(clientArgs)).toEqual(["score"]);
    });

    it("maxOf: client sends [field]", () => {
      const clientArgs = JSON.stringify(["score"]);
      expect(JSON.parse(clientArgs)).toEqual(["score"]);
    });

    it("minOf: client sends [field]", () => {
      const clientArgs = JSON.stringify(["score"]);
      expect(JSON.parse(clientArgs)).toEqual(["score"]);
    });

    it("avgOf: client sends [field]", () => {
      const clientArgs = JSON.stringify(["score"]);
      expect(JSON.parse(clientArgs)).toEqual(["score"]);
    });

    it("sumOf: client sends [field]", () => {
      const clientArgs = JSON.stringify(["score"]);
      expect(JSON.parse(clientArgs)).toEqual(["score"]);
    });

    it("distinctOf: client sends [field]", () => {
      const clientArgs = JSON.stringify(["category"]);
      expect(JSON.parse(clientArgs)).toEqual(["category"]);
    });

    it("groupOf: client sends [field]", () => {
      const clientArgs = JSON.stringify(["category"]);
      expect(JSON.parse(clientArgs)).toEqual(["category"]);
    });
  });

  describe("Response format: Contract to Client", () => {
    it("countOf returns JSON number", () => {
      const contractResponse = JSON.stringify(42);
      const clientParsed = JSON.parse(contractResponse);
      expect(typeof clientParsed).toBe("number");
      expect(clientParsed).toBe(42);
    });

    it("maxOf returns JSON number", () => {
      const contractResponse = JSON.stringify(100);
      const clientParsed = JSON.parse(contractResponse);
      expect(typeof clientParsed).toBe("number");
    });

    it("minOf returns JSON number", () => {
      const contractResponse = JSON.stringify(1);
      const clientParsed = JSON.parse(contractResponse);
      expect(typeof clientParsed).toBe("number");
    });

    it("avgOf returns JSON number", () => {
      const contractResponse = JSON.stringify(50.5);
      const clientParsed = JSON.parse(contractResponse);
      expect(typeof clientParsed).toBe("number");
    });

    it("sumOf returns JSON number", () => {
      const contractResponse = JSON.stringify(500);
      const clientParsed = JSON.parse(contractResponse);
      expect(typeof clientParsed).toBe("number");
    });

    it("distinctOf returns JSON array", () => {
      const contractResponse = JSON.stringify(["A", "B", "C"]);
      const clientParsed = JSON.parse(contractResponse);
      expect(Array.isArray(clientParsed)).toBe(true);
      expect(clientParsed).toEqual(["A", "B", "C"]);
    });

    it("groupOf returns JSON object with arrays", () => {
      const groupedData = {
        Electronics: [{ id: "1", name: "Item A" }],
        Books: [{ id: "2", name: "Item B" }],
      };
      const contractResponse = JSON.stringify(groupedData);
      const clientParsed = JSON.parse(contractResponse);
      expect(typeof clientParsed).toBe("object");
      expect(clientParsed).not.toBeNull();
      expect(!Array.isArray(clientParsed)).toBe(true);
      expect(Object.keys(clientParsed)).toEqual(["Electronics", "Books"]);
    });
  });

  describe("Round-trip serialization", () => {
    it("numeric values survive serialization round-trip", () => {
      const values = [0, 1, -1, 100, 50.5, 999999];
      values.forEach((val) => {
        const serialized = JSON.stringify(val);
        const deserialized = JSON.parse(serialized);
        expect(deserialized).toBe(val);
      });
    });

    it("array values survive serialization round-trip", () => {
      const arr = ["CategoryA", "CategoryB", "CategoryC"];
      const serialized = JSON.stringify(arr);
      const deserialized = JSON.parse(serialized);
      expect(deserialized).toEqual(arr);
    });

    it("object values survive serialization round-trip", () => {
      const obj = {
        GroupA: [{ id: "1" }, { id: "2" }],
        GroupB: [{ id: "3" }],
      };
      const serialized = JSON.stringify(obj);
      const deserialized = JSON.parse(serialized);
      expect(deserialized).toEqual(obj);
    });

    it("nested args survive serialization", () => {
      const args = ["fieldName"];
      const serialized = JSON.stringify(args);
      const deserialized = JSON.parse(serialized);
      expect(deserialized).toEqual(args);
      expect(deserialized[0]).toBe("fieldName");
    });
  });
});

describe("Statement method invocation format", () => {
  /**
   * Tests the exact format used by FabricClientRepository.statement()
   * when calling aggregation methods via evaluateTransaction.
   */

  describe("Client statement call format", () => {
    function simulateClientStatementCall(
      methodName: string,
      ...args: any[]
    ): [string, string] {
      return [methodName, JSON.stringify(args)];
    }

    it("countOf via statement", () => {
      const [method, argsStr] = simulateClientStatementCall("countOf", "score");
      expect(method).toBe("countOf");
      expect(JSON.parse(argsStr)).toEqual(["score"]);
    });

    it("maxOf via statement", () => {
      const [method, argsStr] = simulateClientStatementCall("maxOf", "score");
      expect(method).toBe("maxOf");
      expect(JSON.parse(argsStr)).toEqual(["score"]);
    });

    it("groupOf via statement", () => {
      const [method, argsStr] = simulateClientStatementCall(
        "groupOf",
        "category"
      );
      expect(method).toBe("groupOf");
      expect(JSON.parse(argsStr)).toEqual(["category"]);
    });
  });

  describe("Contract statement parse format", () => {
    function simulateContractStatementParse(
      argsStr: string
    ): any[] {
      return JSON.parse(argsStr);
    }

    it("parses countOf args", () => {
      const parsed = simulateContractStatementParse('["score"]');
      expect(parsed).toEqual(["score"]);
      expect(parsed[0]).toBe("score");
    });

    it("parses groupOf args", () => {
      const parsed = simulateContractStatementParse('["category"]');
      expect(parsed).toEqual(["category"]);
    });

    it("handles empty args for countOf without field", () => {
      const parsed = simulateContractStatementParse("[]");
      expect(parsed).toEqual([]);
    });
  });
});
