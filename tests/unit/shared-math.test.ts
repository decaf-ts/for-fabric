import { ValidationError } from "@decaf-ts/db-decorators";
import { OverflowError } from "../../src/shared/errors";
import { add, safeParseInt, sub } from "../../src/shared/math";

describe("shared/math", () => {
  describe("add", () => {
    it("adds numbers without overflow", () => {
      expect(add(2, 3)).toBe(5);
    });

    it("throws OverflowError when addition overflows", () => {
      expect(() =>
        add(Number.MAX_SAFE_INTEGER, 2)
      ).toThrow(OverflowError);
    });
  });

  describe("sub", () => {
    it("subtracts numbers without overflow", () => {
      expect(sub(5, 3)).toBe(2);
    });

    it("throws OverflowError when subtraction overflows", () => {
      expect(() =>
        sub(-Number.MAX_SAFE_INTEGER, 2)
      ).toThrow(OverflowError);
    });
  });

  describe("safeParseInt", () => {
    it("parses integer strings", () => {
      expect(safeParseInt("123")).toBe(123);
    });

    it("rejects non-digit strings", () => {
      expect(() => safeParseInt("12a3")).toThrow(ValidationError);
    });

    it("rejects empty strings", () => {
      expect(() => safeParseInt("")).toThrow(ValidationError);
    });
  });
});
