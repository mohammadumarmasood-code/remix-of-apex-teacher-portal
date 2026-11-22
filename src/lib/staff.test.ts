import { describe, expect, it } from "vitest";
import { isValidPassword } from "./staff";
import { assertManager } from "./staff.functions";

describe("teacher password validation", () => {
  it("accepts the six-character minimum", () => {
    expect(isValidPassword("123456")).toBe(true);
  });

  it("rejects passwords shorter than six characters", () => {
    expect(isValidPassword("12345")).toBe(false);
  });

  it("allows protected teacher actions only for managers", async () => {
    await expect(assertManager({ rpc: async () => ({ data: true }) }, "manager-id")).resolves.toBeUndefined();
    await expect(assertManager({ rpc: async () => ({ data: false }) }, "teacher-id")).rejects.toThrow(
      "Only the manager can do this",
    );
  });
});