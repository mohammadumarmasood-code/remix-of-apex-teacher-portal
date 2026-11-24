export const attendanceStatuses = ["present", "absent", "late"] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];

export function isAttendanceStatus(value: string): value is AttendanceStatus {
  return attendanceStatuses.some((status) => status === value);
}

export function localDateInputValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}