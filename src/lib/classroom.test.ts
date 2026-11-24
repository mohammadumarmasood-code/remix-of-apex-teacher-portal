import { describe, expect, it } from "vitest";
import { attendanceStatuses, isAttendanceStatus, localDateInputValue } from "./classroom";

describe("attendance records", () => {
  it("accepts exactly present, absent, and late", () => {
    expect(attendanceStatuses).toEqual(["present", "absent", "late"]);
    expect(isAttendanceStatus("present")).toBe(true);
    expect(isAttendanceStatus("absent")).toBe(true);
    expect(isAttendanceStatus("late")).toBe(true);
    expect(isAttendanceStatus("excused")).toBe(false);
  });

  it("formats a date input using the local calendar day", () => {
    expect(localDateInputValue(new Date("2026-11-23T00:30:00+05:30"))).toBe("2026-11-23");
  });
});