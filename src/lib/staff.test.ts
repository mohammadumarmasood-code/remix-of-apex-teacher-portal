import { describe, expect, it } from "vitest";
import { isValidPassword } from "./staff";
import { assertManager, assertStaff } from "./staff.functions";

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

  it("allows managers and teachers, but not students, to create student accounts", async () => {
    const managerRpc = async (_name: string, args: { _role: string }) => ({ data: args._role === "manager" });
    const teacherRpc = async (_name: string, args: { _role: string }) => ({ data: args._role === "teacher" });
    const studentRpc = async () => ({ data: false });

    await expect(assertStaff({ rpc: managerRpc }, "manager-id")).resolves.toBe("manager");
    await expect(assertStaff({ rpc: teacherRpc }, "teacher-id")).resolves.toBe("teacher");
    await expect(assertStaff({ rpc: studentRpc }, "student-id")).rejects.toThrow(
      "Only the manager or a teacher can add students",
    );
  });
});