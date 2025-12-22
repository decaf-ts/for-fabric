import { SimpleDeterministicSerializer } from "../../src/shared/SimpleDeterministicSerializer";
import "@decaf-ts/core";

describe("shared/SimpleDeterministicSerializer", () => {
  const serializer = new SimpleDeterministicSerializer<any>();

  it("preSerialize returns a shallow copy", () => {
    const model = { id: 1, name: "Alice" };
    const serialized = serializer["preSerialize"](model);
    expect(serialized).toEqual(expect.objectContaining(model));
    serialized.name = "Bob";
    expect(model.name).toBe("Alice");
  });

  it("serialize sorts keys deterministically", () => {
    const model = { z: 1, a: 2, nested: { b: 4, a: 3 } };
    const output = serializer.serialize(model);
    expect(output).toContain('"a":2,"nested":{"a":3,"b":4},"z":1}');
  });

  it("deserialize returns parsed object", () => {
    const json = '{"a":1,"b":2}';
    expect(serializer.deserialize(json)).toEqual({ a: 1, b: 2 });
  });
});
