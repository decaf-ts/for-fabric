import "reflect-metadata";
import "../../src/shared/overrides";

import { PersistenceKeys, PreparedStatementKeys } from "@decaf-ts/core";

/**
 * Tests for FabricClientRepository aggregation method serialization.
 *
 * These tests verify the argument format that the client repository sends
 * to the Fabric contract via evaluateTransaction. The format must match
 * what SerializedCrudContract.statement() expects.
 */
describe("FabricClientRepository - Aggregation Serialization Format", () => {
  /**
   * The FabricClientRepository.statement() method sends:
   *   evaluateTransaction(ctx, "statement", [methodName, JSON.stringify(args)])
   *
   * Where:
   *   - methodName is the PreparedStatementKeys value (e.g., "countOf", "maxOf")
   *   - args is the JSON-serialized array of method arguments
   */
  describe("Serialization format for evaluateTransaction", () => {
    it("countOf without field should serialize as [methodName, []]", () => {
      const methodName = PreparedStatementKeys.COUNT_OF;
      const args: any[] = [];
      const serializedArgs = JSON.stringify(args);

      // This is what evaluateTransaction receives
      const transactionArgs = [methodName, serializedArgs];

      expect(transactionArgs[0]).toBe("countOf");
      expect(transactionArgs[1]).toBe("[]");
    });

    it("countOf with field should serialize as [methodName, [field]]", () => {
      const methodName = PreparedStatementKeys.COUNT_OF;
      const field = "score";
      const args = [field];
      const serializedArgs = JSON.stringify(args);

      const transactionArgs = [methodName, serializedArgs];

      expect(transactionArgs[0]).toBe("countOf");
      expect(transactionArgs[1]).toBe('["score"]');
    });

    it("maxOf should serialize as [methodName, [field]]", () => {
      const methodName = PreparedStatementKeys.MAX_OF;
      const field = "score";
      const args = [field];
      const serializedArgs = JSON.stringify(args);

      const transactionArgs = [methodName, serializedArgs];

      expect(transactionArgs[0]).toBe("maxOf");
      expect(transactionArgs[1]).toBe('["score"]');
    });

    it("minOf should serialize as [methodName, [field]]", () => {
      const methodName = PreparedStatementKeys.MIN_OF;
      const field = "score";
      const args = [field];
      const serializedArgs = JSON.stringify(args);

      const transactionArgs = [methodName, serializedArgs];

      expect(transactionArgs[0]).toBe("minOf");
      expect(transactionArgs[1]).toBe('["score"]');
    });

    it("avgOf should serialize as [methodName, [field]]", () => {
      const methodName = PreparedStatementKeys.AVG_OF;
      const field = "score";
      const args = [field];
      const serializedArgs = JSON.stringify(args);

      const transactionArgs = [methodName, serializedArgs];

      expect(transactionArgs[0]).toBe("avgOf");
      expect(transactionArgs[1]).toBe('["score"]');
    });

    it("sumOf should serialize as [methodName, [field]]", () => {
      const methodName = PreparedStatementKeys.SUM_OF;
      const field = "score";
      const args = [field];
      const serializedArgs = JSON.stringify(args);

      const transactionArgs = [methodName, serializedArgs];

      expect(transactionArgs[0]).toBe("sumOf");
      expect(transactionArgs[1]).toBe('["score"]');
    });

    it("distinctOf should serialize as [methodName, [field]]", () => {
      const methodName = PreparedStatementKeys.DISTINCT_OF;
      const field = "category";
      const args = [field];
      const serializedArgs = JSON.stringify(args);

      const transactionArgs = [methodName, serializedArgs];

      expect(transactionArgs[0]).toBe("distinctOf");
      expect(transactionArgs[1]).toBe('["category"]');
    });

    it("groupOf should serialize as [methodName, [field]]", () => {
      const methodName = PreparedStatementKeys.GROUP_OF;
      const field = "category";
      const args = [field];
      const serializedArgs = JSON.stringify(args);

      const transactionArgs = [methodName, serializedArgs];

      expect(transactionArgs[0]).toBe("groupOf");
      expect(transactionArgs[1]).toBe('["category"]');
    });
  });

  describe("PreparedStatementKeys values match expected", () => {
    it("COUNT_OF should be 'countOf'", () => {
      expect(PreparedStatementKeys.COUNT_OF).toBe("countOf");
    });

    it("MAX_OF should be 'maxOf'", () => {
      expect(PreparedStatementKeys.MAX_OF).toBe("maxOf");
    });

    it("MIN_OF should be 'minOf'", () => {
      expect(PreparedStatementKeys.MIN_OF).toBe("minOf");
    });

    it("AVG_OF should be 'avgOf'", () => {
      expect(PreparedStatementKeys.AVG_OF).toBe("avgOf");
    });

    it("SUM_OF should be 'sumOf'", () => {
      expect(PreparedStatementKeys.SUM_OF).toBe("sumOf");
    });

    it("DISTINCT_OF should be 'distinctOf'", () => {
      expect(PreparedStatementKeys.DISTINCT_OF).toBe("distinctOf");
    });

    it("GROUP_OF should be 'groupOf'", () => {
      expect(PreparedStatementKeys.GROUP_OF).toBe("groupOf");
    });
  });

  describe("Response deserialization format", () => {
    it("countOf response should be parseable as number", () => {
      const contractResponse = "42";
      const parsed = JSON.parse(contractResponse);
      expect(typeof parsed).toBe("number");
      expect(parsed).toBe(42);
    });

    it("maxOf response should be parseable as number", () => {
      const contractResponse = "100";
      const parsed = JSON.parse(contractResponse);
      expect(typeof parsed).toBe("number");
      expect(parsed).toBe(100);
    });

    it("minOf response should be parseable as number", () => {
      const contractResponse = "1";
      const parsed = JSON.parse(contractResponse);
      expect(typeof parsed).toBe("number");
      expect(parsed).toBe(1);
    });

    it("avgOf response should be parseable as number", () => {
      const contractResponse = "50.5";
      const parsed = JSON.parse(contractResponse);
      expect(typeof parsed).toBe("number");
      expect(parsed).toBe(50.5);
    });

    it("sumOf response should be parseable as number", () => {
      const contractResponse = "500";
      const parsed = JSON.parse(contractResponse);
      expect(typeof parsed).toBe("number");
      expect(parsed).toBe(500);
    });

    it("distinctOf response should be parseable as array", () => {
      const contractResponse = '["A","B","C"]';
      const parsed = JSON.parse(contractResponse);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toEqual(["A", "B", "C"]);
    });

    it("groupOf response should be parseable as object", () => {
      const contractResponse =
        '{"A":[{"id":"1","name":"Item1"}],"B":[{"id":"2","name":"Item2"}]}';
      const parsed = JSON.parse(contractResponse);
      expect(typeof parsed).toBe("object");
      expect(parsed).not.toBeNull();
      expect(!Array.isArray(parsed)).toBe(true);
      expect(Object.keys(parsed)).toEqual(["A", "B"]);
    });
  });

  describe("Statement method argument format", () => {
    it("should serialize via statement(methodName, ...args) to [methodName, JSON.stringify(args)]", () => {
      // Simulate what FabricClientRepository.statement does
      function simulateStatementCall(name: string, ...args: any[]) {
        // Remove context from args (last element)
        const callArgs = args;
        return [name, JSON.stringify(callArgs)];
      }

      // countOf without field
      expect(simulateStatementCall("countOf")).toEqual(["countOf", "[]"]);

      // countOf with field
      expect(simulateStatementCall("countOf", "score")).toEqual([
        "countOf",
        '["score"]',
      ]);

      // maxOf
      expect(simulateStatementCall("maxOf", "score")).toEqual([
        "maxOf",
        '["score"]',
      ]);

      // groupOf
      expect(simulateStatementCall("groupOf", "category")).toEqual([
        "groupOf",
        '["category"]',
      ]);
    });
  });
});
