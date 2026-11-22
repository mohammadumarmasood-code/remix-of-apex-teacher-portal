import { describe, expect, it } from "vitest";
import { isValidPassword } from "./staff";

describe("teacher password validation", () => {
  it("accepts the six-character minimum", () => {
    expect(isValidPassword("123456")).toBe(true);
  });

  it("rejects passwords shorter than six characters", () => {
    expect(isValidPassword("12345")).toBe(false);
  });
});