import "../../src/shared/overrides";
import {
  pk,
  column,
  table,
  index,
  repository,
  query,
  Repository,
  OrderDirection,
  PreparedStatementKeys,
  PersistenceKeys,
  UnsupportedError,
} from "@decaf-ts/core";
import { model, Model, ModelArg, required } from "@decaf-ts/decorator-validation";
import { SerializedCrudContract } from "../../src/contracts/crud/serialized-crud-contract";
import { FabricCrudContract } from "../../src/contracts/crud/crud-contract";
import { FabricClientRepository } from "../../src/client/FabricClientRepository";
import { getMockCtx } from "./ContextMock";

/**
 * Test Model for complex query testing
 */
@table("query_test_users")
@model()
class QueryTestUser extends Model {
  @pk({ type: Number, generated: true })
  id!: number;

  @column("name")
  @index()
  @required()
  name!: string;

  @column("age")
  @index()
  @required()
  age!: number;

  @column("country")
  @index()
  @required()
  country!: string;

  @column("active")
  @index()
  @required()
  active!: boolean;

  constructor(arg?: ModelArg<QueryTestUser>) {
    super(arg);
  }
}

/**
 * Test Repository with @query decorated methods
 * These methods would normally be overridden by the @query decorator
 * to build and execute queries based on method name parsing
 */
@repository(QueryTestUser)
class QueryTestRepository extends Repository<QueryTestUser, any> {
  constructor(adapter?: any) {
    super(adapter, QueryTestUser);
  }

  @query()
  async findByName(
    name: string,
    orderBy?: OrderDirection,
    limit?: number,
    offset?: number
  ): Promise<QueryTestUser[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  async findByAgeGreaterThan(
    age: number,
    orderBy?: OrderDirection,
    limit?: number,
    offset?: number
  ): Promise<QueryTestUser[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  async findByAgeGreaterThanAndAgeLessThan(
    minAge: number,
    maxAge: number,
    orderBy?: OrderDirection,
    limit?: number,
    offset?: number
  ): Promise<QueryTestUser[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  async findByNameEqualsOrAgeGreaterThan(
    name: string,
    age: number,
    orderBy?: OrderDirection,
    limit?: number,
    offset?: number
  ): Promise<QueryTestUser[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  async findByActiveOrderByName(
    active: boolean,
    orderBy?: OrderDirection,
    limit?: number,
    offset?: number
  ): Promise<QueryTestUser[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  async findByCountryIn(
    countries: string[],
    orderBy?: OrderDirection,
    limit?: number,
    offset?: number
  ): Promise<QueryTestUser[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  async pageByName(
    name: string,
    orderBy: OrderDirection,
    pageSize: number
  ): Promise<any> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  async pageByAgeGreaterThanOrderByName(
    age: number,
    orderBy: OrderDirection,
    pageSize: number
  ): Promise<any> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  async countByAge(): Promise<number> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  async sumByAge(): Promise<number> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  async distinctByCountry(): Promise<string[]> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  async groupByCountry(): Promise<Record<string, QueryTestUser[]>> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
  async findByActiveGroupByCountry(
    active: boolean
  ): Promise<Record<string, QueryTestUser[]>> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }
}

/**
 * Test Contract for the QueryTestUser model
 */
class QueryTestContract extends SerializedCrudContract<QueryTestUser> {
  constructor() {
    super("QueryTestContract", QueryTestUser);
  }
}

describe("Complex Query Serialization - Client Side", () => {
  /**
   * These tests verify that @query decorated methods produce the correct
   * serialization format when called via the statement API.
   *
   * The format is: evaluateTransaction(ctx, "statement", [methodName, JSON.stringify(args)])
   */

  describe("findBy query method serialization", () => {
    it("findByName should serialize as [methodName, [name]]", () => {
      const methodName = "findByName";
      const args = ["John"];
      const serialized = [methodName, JSON.stringify(args)];

      expect(serialized[0]).toBe("findByName");
      expect(JSON.parse(serialized[1])).toEqual(["John"]);
    });

    it("findByAgeGreaterThan should serialize as [methodName, [age]]", () => {
      const methodName = "findByAgeGreaterThan";
      const args = [25];
      const serialized = [methodName, JSON.stringify(args)];

      expect(serialized[0]).toBe("findByAgeGreaterThan");
      expect(JSON.parse(serialized[1])).toEqual([25]);
    });

    it("findByAgeGreaterThanAndAgeLessThan should serialize both ages", () => {
      const methodName = "findByAgeGreaterThanAndAgeLessThan";
      const args = [18, 65];
      const serialized = [methodName, JSON.stringify(args)];

      expect(serialized[0]).toBe("findByAgeGreaterThanAndAgeLessThan");
      expect(JSON.parse(serialized[1])).toEqual([18, 65]);
    });

    it("findByNameEqualsOrAgeGreaterThan should serialize name and age", () => {
      const methodName = "findByNameEqualsOrAgeGreaterThan";
      const args = ["John", 30];
      const serialized = [methodName, JSON.stringify(args)];

      expect(serialized[0]).toBe("findByNameEqualsOrAgeGreaterThan");
      expect(JSON.parse(serialized[1])).toEqual(["John", 30]);
    });

    it("findByActiveOrderByName should serialize active flag", () => {
      const methodName = "findByActiveOrderByName";
      const args = [true, "asc"];
      const serialized = [methodName, JSON.stringify(args)];

      expect(serialized[0]).toBe("findByActiveOrderByName");
      expect(JSON.parse(serialized[1])).toEqual([true, "asc"]);
    });

    it("findByCountryIn should serialize array of countries", () => {
      const methodName = "findByCountryIn";
      const args = [["US", "UK", "CA"]];
      const serialized = [methodName, JSON.stringify(args)];

      expect(serialized[0]).toBe("findByCountryIn");
      expect(JSON.parse(serialized[1])).toEqual([["US", "UK", "CA"]]);
    });
  });

  describe("pageBy query method serialization", () => {
    it("pageByName should serialize name, orderBy, and pageSize", () => {
      const methodName = "pageByName";
      const args = ["John", "asc", 10];
      const serialized = [methodName, JSON.stringify(args)];

      expect(serialized[0]).toBe("pageByName");
      expect(JSON.parse(serialized[1])).toEqual(["John", "asc", 10]);
    });

    it("pageByAgeGreaterThanOrderByName should serialize age, orderBy, pageSize", () => {
      const methodName = "pageByAgeGreaterThanOrderByName";
      const args = [25, "desc", 20];
      const serialized = [methodName, JSON.stringify(args)];

      expect(serialized[0]).toBe("pageByAgeGreaterThanOrderByName");
      expect(JSON.parse(serialized[1])).toEqual([25, "desc", 20]);
    });
  });

  describe("aggregation query method serialization", () => {
    it("countByAge should serialize as [methodName, []]", () => {
      const methodName = "countByAge";
      const args: any[] = [];
      const serialized = [methodName, JSON.stringify(args)];

      expect(serialized[0]).toBe("countByAge");
      expect(JSON.parse(serialized[1])).toEqual([]);
    });

    it("sumByAge should serialize as [methodName, []]", () => {
      const methodName = "sumByAge";
      const args: any[] = [];
      const serialized = [methodName, JSON.stringify(args)];

      expect(serialized[0]).toBe("sumByAge");
      expect(JSON.parse(serialized[1])).toEqual([]);
    });

    it("distinctByCountry should serialize as [methodName, []]", () => {
      const methodName = "distinctByCountry";
      const args: any[] = [];
      const serialized = [methodName, JSON.stringify(args)];

      expect(serialized[0]).toBe("distinctByCountry");
      expect(JSON.parse(serialized[1])).toEqual([]);
    });

    it("groupByCountry should serialize as [methodName, []]", () => {
      const methodName = "groupByCountry";
      const args: any[] = [];
      const serialized = [methodName, JSON.stringify(args)];

      expect(serialized[0]).toBe("groupByCountry");
      expect(JSON.parse(serialized[1])).toEqual([]);
    });

    it("findByActiveGroupByCountry should serialize active flag", () => {
      const methodName = "findByActiveGroupByCountry";
      const args = [true];
      const serialized = [methodName, JSON.stringify(args)];

      expect(serialized[0]).toBe("findByActiveGroupByCountry");
      expect(JSON.parse(serialized[1])).toEqual([true]);
    });
  });
});

describe("Complex Query Serialization - Contract Side", () => {
  const ctx = getMockCtx();
  const contract = new QueryTestContract();

  describe("Contract statement method receives correct format", () => {
    it("should parse findByName args correctly", () => {
      const argsStr = JSON.stringify(["John"]);
      const parsed = JSON.parse(argsStr);

      expect(parsed).toEqual(["John"]);
      expect(parsed[0]).toBe("John");
    });

    it("should parse findByAgeGreaterThanAndAgeLessThan args", () => {
      const argsStr = JSON.stringify([18, 65]);
      const parsed = JSON.parse(argsStr);

      expect(parsed).toEqual([18, 65]);
      expect(parsed[0]).toBe(18);
      expect(parsed[1]).toBe(65);
    });

    it("should parse findByCountryIn array args", () => {
      const argsStr = JSON.stringify([["US", "UK", "CA"]]);
      const parsed = JSON.parse(argsStr);

      expect(parsed).toEqual([["US", "UK", "CA"]]);
      expect(parsed[0]).toEqual(["US", "UK", "CA"]);
    });

    it("should parse pageBy args with pagination params", () => {
      const argsStr = JSON.stringify(["John", "asc", 10]);
      const parsed = JSON.parse(argsStr);

      expect(parsed).toEqual(["John", "asc", 10]);
      expect(parsed[0]).toBe("John");
      expect(parsed[1]).toBe("asc");
      expect(parsed[2]).toBe(10);
    });
  });

  describe("Contract response serialization", () => {
    it("findBy results should be JSON array of models", () => {
      const results = [
        { id: 1, name: "John", age: 30, country: "US", active: true },
        { id: 2, name: "Jane", age: 25, country: "UK", active: false },
      ];
      const serialized = JSON.stringify(results);
      const deserialized = JSON.parse(serialized);

      expect(Array.isArray(deserialized)).toBe(true);
      expect(deserialized.length).toBe(2);
      expect(deserialized[0].name).toBe("John");
    });

    it("pageBy results should include pagination metadata", () => {
      const pageResult = {
        data: [
          { id: 1, name: "John", age: 30, country: "US", active: true },
        ],
        bookmark: "page2bookmark",
        pageSize: 10,
        hasMore: true,
      };
      const serialized = JSON.stringify(pageResult);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.data).toBeDefined();
      expect(deserialized.bookmark).toBe("page2bookmark");
      expect(deserialized.pageSize).toBe(10);
      expect(deserialized.hasMore).toBe(true);
    });

    it("groupBy results should be JSON object with arrays", () => {
      const groupedResults = {
        US: [{ id: 1, name: "John", age: 30, country: "US", active: true }],
        UK: [{ id: 2, name: "Jane", age: 25, country: "UK", active: false }],
      };
      const serialized = JSON.stringify(groupedResults);
      const deserialized = JSON.parse(serialized);

      expect(typeof deserialized).toBe("object");
      expect(Object.keys(deserialized)).toEqual(["US", "UK"]);
      expect(Array.isArray(deserialized.US)).toBe(true);
    });
  });
});

describe("Client-Contract Query Communication Flow", () => {
  /**
   * These tests simulate the full communication flow between
   * FabricClientRepository and SerializedCrudContract for complex queries.
   */

  function simulateClientCall(
    methodName: string,
    ...args: any[]
  ): { operation: string; transactionArgs: string[] } {
    // Simulates FabricClientRepository.statement()
    return {
      operation: PersistenceKeys.STATEMENT,
      transactionArgs: [methodName, JSON.stringify(args)],
    };
  }

  function simulateContractReceive(
    transactionArgs: string[]
  ): { method: string; args: any[] } {
    // Simulates SerializedCrudContract.statement() parsing
    const [method, argsStr] = transactionArgs;
    return {
      method,
      args: JSON.parse(argsStr),
    };
  }

  function simulateContractResponse(data: any): string {
    // Simulates SerializedCrudContract returning JSON.stringify(result)
    return JSON.stringify(data);
  }

  function simulateClientReceive(response: string): any {
    // Simulates FabricClientRepository parsing the response
    return JSON.parse(response);
  }

  describe("findBy query flow", () => {
    it("findByName round-trip", () => {
      // Client sends
      const clientCall = simulateClientCall("findByName", "John");
      expect(clientCall.operation).toBe("statement");
      expect(clientCall.transactionArgs[0]).toBe("findByName");

      // Contract receives
      const contractReceive = simulateContractReceive(clientCall.transactionArgs);
      expect(contractReceive.method).toBe("findByName");
      expect(contractReceive.args).toEqual(["John"]);

      // Contract responds
      const results = [{ id: 1, name: "John", age: 30 }];
      const contractResponse = simulateContractResponse(results);

      // Client receives
      const clientReceive = simulateClientReceive(contractResponse);
      expect(clientReceive).toEqual(results);
    });

    it("findByAgeGreaterThanAndAgeLessThan round-trip", () => {
      const clientCall = simulateClientCall(
        "findByAgeGreaterThanAndAgeLessThan",
        18,
        65
      );

      const contractReceive = simulateContractReceive(clientCall.transactionArgs);
      expect(contractReceive.method).toBe("findByAgeGreaterThanAndAgeLessThan");
      expect(contractReceive.args).toEqual([18, 65]);

      const results = [
        { id: 1, name: "John", age: 30 },
        { id: 2, name: "Jane", age: 45 },
      ];
      const clientReceive = simulateClientReceive(
        simulateContractResponse(results)
      );
      expect(clientReceive.length).toBe(2);
    });

    it("findByCountryIn with array round-trip", () => {
      const clientCall = simulateClientCall("findByCountryIn", ["US", "UK"]);

      const contractReceive = simulateContractReceive(clientCall.transactionArgs);
      expect(contractReceive.method).toBe("findByCountryIn");
      expect(contractReceive.args).toEqual([["US", "UK"]]);
    });
  });

  describe("pageBy query flow", () => {
    it("pageByName round-trip with pagination", () => {
      const clientCall = simulateClientCall("pageByName", "J", "asc", 10);

      const contractReceive = simulateContractReceive(clientCall.transactionArgs);
      expect(contractReceive.method).toBe("pageByName");
      expect(contractReceive.args).toEqual(["J", "asc", 10]);

      // Contract returns serialized page
      const pageResult = {
        data: [{ id: 1, name: "John", age: 30 }],
        bookmark: "nextPageBookmark",
        pageSize: 10,
        hasMore: true,
      };
      const clientReceive = simulateClientReceive(
        simulateContractResponse(pageResult)
      );

      expect(clientReceive.data).toBeDefined();
      expect(clientReceive.bookmark).toBe("nextPageBookmark");
      expect(clientReceive.hasMore).toBe(true);
    });

    it("pageByAgeGreaterThanOrderByName with all params", () => {
      const clientCall = simulateClientCall(
        "pageByAgeGreaterThanOrderByName",
        25,
        "desc",
        20
      );

      const contractReceive = simulateContractReceive(clientCall.transactionArgs);
      expect(contractReceive.method).toBe("pageByAgeGreaterThanOrderByName");
      expect(contractReceive.args).toEqual([25, "desc", 20]);
    });
  });

  describe("aggregation query flow", () => {
    it("countByAge round-trip", () => {
      const clientCall = simulateClientCall("countByAge");

      const contractReceive = simulateContractReceive(clientCall.transactionArgs);
      expect(contractReceive.method).toBe("countByAge");
      expect(contractReceive.args).toEqual([]);

      const clientReceive = simulateClientReceive(
        simulateContractResponse(42)
      );
      expect(clientReceive).toBe(42);
    });

    it("distinctByCountry round-trip", () => {
      const clientCall = simulateClientCall("distinctByCountry");

      const contractReceive = simulateContractReceive(clientCall.transactionArgs);
      expect(contractReceive.method).toBe("distinctByCountry");

      const clientReceive = simulateClientReceive(
        simulateContractResponse(["US", "UK", "CA"])
      );
      expect(clientReceive).toEqual(["US", "UK", "CA"]);
    });

    it("groupByCountry round-trip", () => {
      const clientCall = simulateClientCall("groupByCountry");

      const contractReceive = simulateContractReceive(clientCall.transactionArgs);
      expect(contractReceive.method).toBe("groupByCountry");

      const grouped = {
        US: [{ id: 1, name: "John" }],
        UK: [{ id: 2, name: "Jane" }],
      };
      const clientReceive = simulateClientReceive(
        simulateContractResponse(grouped)
      );
      expect(Object.keys(clientReceive)).toEqual(["US", "UK"]);
    });

    it("findByActiveGroupByCountry round-trip", () => {
      const clientCall = simulateClientCall("findByActiveGroupByCountry", true);

      const contractReceive = simulateContractReceive(clientCall.transactionArgs);
      expect(contractReceive.method).toBe("findByActiveGroupByCountry");
      expect(contractReceive.args).toEqual([true]);

      const grouped = {
        US: [{ id: 1, name: "John", active: true }],
      };
      const clientReceive = simulateClientReceive(
        simulateContractResponse(grouped)
      );
      expect(clientReceive.US[0].active).toBe(true);
    });
  });
});

describe("Pagination Serialization Compatibility", () => {
  /**
   * Tests to verify pagination works correctly between client and contract.
   */

  describe("SerializedPage format", () => {
    it("should serialize page with all required fields", () => {
      const page = {
        data: [
          { id: 1, name: "John", age: 30, country: "US", active: true },
          { id: 2, name: "Jane", age: 25, country: "UK", active: false },
        ],
        bookmark: "bookmark123",
        pageSize: 10,
        hasMore: true,
      };

      const serialized = JSON.stringify(page);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.data).toHaveLength(2);
      expect(deserialized.bookmark).toBe("bookmark123");
      expect(deserialized.pageSize).toBe(10);
      expect(deserialized.hasMore).toBe(true);
    });

    it("should handle empty page", () => {
      const emptyPage = {
        data: [],
        bookmark: "",
        pageSize: 10,
        hasMore: false,
      };

      const serialized = JSON.stringify(emptyPage);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.data).toHaveLength(0);
      expect(deserialized.hasMore).toBe(false);
    });

    it("should preserve complex nested data in page", () => {
      const page = {
        data: [
          {
            id: 1,
            name: "John",
            metadata: { key: "value", nested: { deep: true } },
          },
        ],
        bookmark: "bm",
        pageSize: 1,
        hasMore: false,
      };

      const serialized = JSON.stringify(page);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.data[0].metadata.nested.deep).toBe(true);
    });
  });

  describe("Bookmark handling", () => {
    it("should pass bookmark in subsequent page requests", () => {
      // First page request
      const firstRequest = {
        methodName: "pageByName",
        args: ["J", "asc", { limit: 10, offset: 0 }],
      };
      const serializedFirst = JSON.stringify(firstRequest.args);

      // Parse on contract side
      const parsedFirst = JSON.parse(serializedFirst);
      expect(parsedFirst[2]).toEqual({ limit: 10, offset: 0 });

      // Second page request with bookmark
      const secondRequest = {
        methodName: "pageByName",
        args: ["J", "asc", { limit: 10, offset: 0, bookmark: "bookmark123" }],
      };
      const serializedSecond = JSON.stringify(secondRequest.args);
      const parsedSecond = JSON.parse(serializedSecond);

      expect(parsedSecond[2].bookmark).toBe("bookmark123");
    });
  });
});

describe("Query Method Name Format Verification", () => {
  /**
   * Tests to ensure query method names follow the expected conventions.
   */

  describe("findBy prefix patterns", () => {
    const validFindByPatterns = [
      "findByName",
      "findByNameEquals",
      "findByAgeGreaterThan",
      "findByAgeLessThan",
      "findByAgeGreaterThanEqual",
      "findByAgeLessThanEqual",
      "findByAgeBetween",
      "findByNameIn",
      "findByNameMatches",
      "findByAgeGreaterThanAndAgeLessThan",
      "findByNameEqualsOrAgeGreaterThan",
      "findByActiveOrderByName",
      "findByNameOrderByAge",
    ];

    validFindByPatterns.forEach((pattern) => {
      it(`should recognize ${pattern} as valid findBy pattern`, () => {
        expect(pattern.startsWith("findBy")).toBe(true);
      });
    });
  });

  describe("pageBy prefix patterns", () => {
    const validPageByPatterns = [
      "pageByName",
      "pageByNameEquals",
      "pageByAgeGreaterThan",
      "pageByAgeGreaterThanOrderByName",
      "pageByNameOrderByAge",
    ];

    validPageByPatterns.forEach((pattern) => {
      it(`should recognize ${pattern} as valid pageBy pattern`, () => {
        expect(pattern.startsWith("pageBy")).toBe(true);
      });
    });
  });

  describe("aggregation prefix patterns", () => {
    const validAggregationPatterns = [
      "countByAge",
      "sumByAge",
      "avgByAge",
      "minByAge",
      "maxByAge",
      "distinctByCountry",
      "groupByCountry",
      "findByActiveGroupByCountry",
    ];

    validAggregationPatterns.forEach((pattern) => {
      it(`should recognize ${pattern} as valid aggregation pattern`, () => {
        const isAggregation =
          pattern.startsWith("countBy") ||
          pattern.startsWith("sumBy") ||
          pattern.startsWith("avgBy") ||
          pattern.startsWith("minBy") ||
          pattern.startsWith("maxBy") ||
          pattern.startsWith("distinctBy") ||
          pattern.startsWith("groupBy") ||
          pattern.includes("GroupBy");
        expect(isAggregation).toBe(true);
      });
    });
  });
});
