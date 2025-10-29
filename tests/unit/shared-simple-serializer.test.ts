import { SimpleDeterministicSerializer } from "../../src/shared/SimpleDeterministicSerializer";

describe("shared/SimpleDeterministicSerializer", () => {
  const serializer = new SimpleDeterministicSerializer<any>();

  it("preSerialize returns a shallow copy", () => {
    const model = { id: 1, name: "Alice" };
    const serialized = serializer.preSerialize(model);
    expect(serialized).toEqual(model);
    serialized.name = "Bob";
    expect(model.name).toBe("Alice");
  });

  it("serialize sorts keys deterministically", () => {
    const model = { z: 1, a: 2, nested: { b: 4, a: 3 } };
    const output = serializer.serialize(model);
    expect(output).toBe(
      '{"a":2,"nested":{"a":3,"b":4},"z":1}'
    );
  });

  it("deserialize returns parsed object", () => {
    const json = '{"a":1,"b":2}';
    expect(serializer.deserialize(json)).toEqual({ a: 1, b: 2 });
  });
});
