import {
  generateFabricEventName,
  parseEventName,
} from "../../src/shared/events";

describe("shared/events", () => {
  it("generates event names with and without owner", () => {
    expect(generateFabricEventName("wallet", "create")).toBe("wallet_create");
    expect(generateFabricEventName("wallet", "update", "ownerA")).toBe(
      "wallet_update_ownerA"
    );
  });

  it("parses event names with two parts", () => {
    expect(parseEventName("wallet_create")).toEqual({
      table: "wallet",
      event: "create",
      owner: undefined,
    });
  });

  it("parses event names with owner", () => {
    expect(parseEventName("wallet_update_ownerA")).toEqual({
      table: "wallet",
      event: "update",
      owner: "ownerA",
    });
  });

  it("returns fallbacks for invalid event names", () => {
    expect(parseEventName("invalid")).toEqual({
      table: undefined,
      event: "invalid",
      owner: undefined,
    });
  });
});
