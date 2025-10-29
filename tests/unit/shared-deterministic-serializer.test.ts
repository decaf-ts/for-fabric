import { DeterministicSerializer } from "../../src/shared/DeterministicSerializer";

describe("shared/DeterministicSerializer", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("serializes models deterministically using preSerialize output", () => {
    const serializer = new DeterministicSerializer<any>();
    const payload = { z: 1, a: 2, nested: { b: 3, a: 4 } };
    jest.spyOn(serializer, "preSerialize").mockReturnValue(payload);

    const result = serializer.serialize({});

    expect(serializer.preSerialize).toHaveBeenCalledTimes(1);
    expect(result).toBe('{"a":2,"nested":{"a":4,"b":3},"z":1}');
  });
});
