import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpen, CalendarDays, Check, Eye, EyeOff, GraduationCap, KeyRound, LogOut,
  Radio, Trash2, UserPlus, Users, Video,
} from "lucide-react";
import { LiveClassRoom } from "@/components/live-class-room";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { attendanceStatuses, isAttendanceStatus, localDateInputValue, type AttendanceStatus } from "@/lib/classroom";
import {
  addStudent, addTeacher, assignStudentToTeacher, removeTeacher,
  setStudentPassword, setTeacherPassword,
} from "@/lib/staff.functions";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Learning Dashboard — Apex Learning Classes" },
      { name: "description", content: "Student, homework, attendance, and class dashboard for Apex Learning Classes, Rudhauli." },
      { property: "og:title", content: "Learning Dashboard — Apex Learning Classes" },
      { property: "og:description", content: "Student, homework, attendance, and class dashboard for Apex Learning Classes, Rudhauli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

type Profile = Pick<Tables<"profiles">, "id" | "full_name" | "mobile" | "subject">;
type Role = "manager" | "teacher" | "student";
type Assignment = Tables<"student_teacher_assignments">;
type Homework = Tables<"homework">;
type Attendance = Tables<"attendance">;
type LiveClass = Tables<"live_classes">;
type ClassRecording = Tables<"live_class_recordings">;
type TeacherForm = { full_name: string; mobile: string; subject: string; password: string };

const emptyTeacherForm: TeacherForm = { full_name: "", mobile: "", subject: "", password: "" };

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [me, setMe] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [classes, setClasses] = useState<LiveClass[]>([]);
  const [recordings, setRecordings] = useState<ClassRecording[]>([]);
  const [recordingUrls, setRecordingUrls] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("students");
  const [teacherForm, setTeacherForm] = useState<TeacherForm>(emptyTeacherForm);
  const [studentForm, setStudentForm] = useState({ full_name: "", mobile: "", password: "", teacher_id: "none" });
  const [homeworkForm, setHomeworkForm] = useState({ title: "", subject: "", instructions: "", due_at: "" });
  const [classForm, setClassForm] = useState({ title: "", description: "", starts_at: "" });
  const [teacherPasswordTarget, setTeacherPasswordTarget] = useState<string | null>(null);
  const [studentPasswordTarget, setStudentPasswordTarget] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [teacherPasswordVisible, setTeacherPasswordVisible] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(localDateInputValue());
  const [attendanceTeacherId, setAttendanceTeacherId] = useState("");
  const [attendanceDrafts, setAttendanceDrafts] = useState<Record<string, AttendanceStatus>>({});
  const [classTeacherId, setClassTeacherId] = useState("");
  const [homeworkTeacherId, setHomeworkTeacherId] = useState("");
  const [activeClass, setActiveClass] = useState<LiveClass | null>(null);
  const [busy, setBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const loadPortalData = useCallback(async (userId: string, currentRole: Role) => {
    let assignmentQuery = supabase.from("student_teacher_assignments").select("*");
    if (currentRole === "teacher") assignmentQuery = assignmentQuery.eq("teacher_id", userId);
    if (currentRole === "student") assignmentQuery = assignmentQuery.eq("student_id", userId);

    const { data: assignmentRows, error: assignmentError } = await assignmentQuery;
    if (assignmentError) toast.error("Could not load class assignments");
    const nextAssignments = assignmentRows ?? [];
    setAssignments(nextAssignments);

    let teacherRows: Profile[] = [];
    if (currentRole === "manager") {
      const { data: teacherRoles, error: teacherRoleError } = await supabase.from("user_roles").select("user_id").eq("role", "teacher");
      if (teacherRoleError) toast.error("Could not load teachers");
      const teacherIds = (teacherRoles ?? []).map((item) => item.user_id);
      if (teacherIds.length) {
        const { data, error } = await supabase.from("profiles").select("*").in("id", teacherIds).order("full_name");
        if (error) toast.error("Could not load teacher profiles");
        teacherRows = data ?? [];
      }
    }
    setTeachers(teacherRows);

    let studentIds: string[] = [];
    if (currentRole === "manager") {
      const { data: studentRoles, error } = await supabase.from("user_roles").select("user_id").eq("role", "student");
      if (error) toast.error("Could not load student accounts");
      studentIds = (studentRoles ?? []).map((item) => item.user_id);
    } else if (currentRole === "teacher") {
      studentIds = nextAssignments.map((item) => item.student_id);
    }
    if (studentIds.length) {
      const { data, error } = await supabase.from("profiles").select("*").in("id", [...new Set(studentIds)]).order("full_name");
      if (error) toast.error("Could not load student profiles");
      setStudents(data ?? []);
    } else {
      setStudents([]);
    }

    const attendanceQuery = currentRole === "student"
      ? supabase.from("attendance").select("*").eq("student_id", userId).order("attendance_date", { ascending: false }).limit(60)
      : supabase.from("attendance").select("*").eq("attendance_date", attendanceDate).order("created_at", { ascending: false });
    const [homeworkResult, attendanceResult, classResult, recordingResult] = await Promise.all([
      supabase.from("homework").select("*").order("created_at", { ascending: false }),
      attendanceQuery,
      supabase.from("live_classes").select("*").order("starts_at", { ascending: true }),
      supabase.from("live_class_recordings").select("*").order("created_at", { ascending: false }),
    ]);
    setHomework(homeworkResult.data ?? []);
    setAttendance(attendanceResult.data ?? []);
    setClasses(classResult.data ?? []);
    const nextRecordings = recordingResult.data ?? [];
    setRecordings(nextRecordings);
    const signedUrls = await Promise.all(nextRecordings.map(async (recording) => {
      const { data } = await supabase.storage.from("class-recordings").createSignedUrl(recording.file_path, 3600);
      return [recording.id, data?.signedUrl ?? ""] as const;
    }));
    setRecordingUrls(Object.fromEntries(signedUrls));
  }, [attendanceDate]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (mounted) navigate({ to: "/" });
        return;
      }
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      const activeRole = roles?.some((item) => item.role === "manager")
        ? "manager"
        : roles?.some((item) => item.role === "teacher")
          ? "teacher"
          : roles?.some((item) => item.role === "student")
            ? "student"
            : null;
      if (!mounted) return;
      if (!profile || !activeRole) {
        await supabase.auth.signOut();
        navigate({ to: "/" });
        return;
      }
      setMe(profile);
      setRole(activeRole);
      setActiveTab(activeRole === "student" ? "homework" : "students");
      await loadPortalData(user.id, activeRole);
    })();
    return () => { mounted = false; };
  }, [loadPortalData, navigate]);

  async function refresh() {
    if (me && role) await loadPortalData(me.id, role);
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  async function onAddTeacher(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await addTeacher({ data: teacherForm });
      toast.success("Teacher added");
      setTeacherForm(emptyTeacherForm);
      setTeacherPasswordVisible(false);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add teacher");
    } finally {
      setBusy(false);
    }
  }

  async function onAddStudent(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await addStudent({ data: {
        full_name: studentForm.full_name,
        mobile: studentForm.mobile,
        password: studentForm.password,
        teacher_id: role === "teacher" ? me?.id : studentForm.teacher_id === "none" ? null : studentForm.teacher_id,
      } });
      toast.success("Student account created");
      setStudentForm({ full_name: "", mobile: "", password: "", teacher_id: "none" });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add student");
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveTeacher(id: string) {
    if (!window.confirm("Remove this teacher account? Existing class records are kept.")) return;
    try {
      await removeTeacher({ data: { id } });
      toast.success("Teacher removed");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove teacher");
    }
  }

  async function onSetPassword(event: React.FormEvent, id: string, target: "teacher" | "student") {
    event.preventDefault();
    setPasswordBusy(true);
    try {
      if (target === "teacher") await setTeacherPassword({ data: { id, password: newPassword } });
      else await setStudentPassword({ data: { id, password: newPassword } });
      toast.success(`${target === "teacher" ? "Teacher" : "Student"} password updated`);
      setTeacherPasswordTarget(null);
      setStudentPasswordTarget(null);
      setNewPassword("");
      setShowNewPassword(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update password");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function onAssignStudent(studentId: string, teacherId: string) {
    try {
      await assignStudentToTeacher({ data: { student_id: studentId, teacher_id: teacherId === "none" ? null : teacherId } });
      toast.success(teacherId === "none" ? "Teacher assignment removed" : "Student assigned");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change assignment");
    }
  }

  async function onAddHomework(event: React.FormEvent) {
    event.preventDefault();
    if (!me || !role) return;
    const teacherId = role === "teacher" ? me.id : homeworkTeacherId || teachers[0]?.id;
    if (!teacherId) {
      toast.error("Choose a teacher first");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("homework").insert({
      teacher_id: teacherId,
      title: homeworkForm.title.trim(),
      instructions: homeworkForm.instructions.trim(),
      subject: homeworkForm.subject.trim() || null,
      due_at: homeworkForm.due_at ? new Date(homeworkForm.due_at).toISOString() : null,
    });
    if (error) toast.error("Could not post homework");
    else {
      toast.success("Homework posted");
      setHomeworkForm({ title: "", subject: "", instructions: "", due_at: "" });
      await refresh();
    }
    setBusy(false);
  }

  async function onDeleteHomework(id: string) {
    const { error } = await supabase.from("homework").delete().eq("id", id);
    if (error) toast.error("Could not remove homework");
    else {
      toast.success("Homework removed");
      await refresh();
    }
  }

  async function onMarkAttendance(studentId: string) {
    if (!me || !role) return;
    const teacherId = role === "teacher" ? me.id : attendanceTeacherId || teachers[0]?.id;
    if (!teacherId) {
      toast.error("Choose a teacher first");
      return;
    }
    const status = attendanceDrafts[studentId] ?? attendance.find((row) => row.student_id === studentId && row.attendance_date === attendanceDate)?.status ?? "present";
    if (!isAttendanceStatus(status)) return;
    const { error } = await supabase.from("attendance").upsert({
      student_id: studentId,
      teacher_id: teacherId,
      attendance_date: attendanceDate,
      status,
    }, { onConflict: "student_id,attendance_date" });
    if (error) toast.error("Could not save attendance");
    else {
      toast.success("Attendance saved");
      await refresh();
    }
  }

  async function onCreateClass(event: React.FormEvent) {
    event.preventDefault();
    if (!me || !role) return;
    const teacherId = role === "teacher" ? me.id : classTeacherId || teachers[0]?.id;
    if (!teacherId) {
      toast.error("Choose a teacher first");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("live_classes").insert({
      teacher_id: teacherId,
      title: classForm.title.trim(),
      description: classForm.description.trim(),
      starts_at: new Date(classForm.starts_at).toISOString(),
    });
    if (error) toast.error("Could not schedule class");
    else {
      toast.success("Class scheduled");
      setClassForm({ title: "", description: "", starts_at: "" });
      await refresh();
    }
    setBusy(false);
  }

  async function startClass(classItem: LiveClass) {
    const { error } = await supabase.from("live_classes").update({ status: "live" }).eq("id", classItem.id);
    if (error) {
      toast.error("Could not start class");
      return;
    }
    const liveClass = { ...classItem, status: "live" };
    setActiveClass(liveClass);
    setClasses((current) => current.map((item) => item.id === liveClass.id ? liveClass : item));
  }

  async function endClass() {
    if (!activeClass) return;
    const { error } = await supabase.from("live_classes").update({ status: "ended" }).eq("id", activeClass.id);
    if (error) toast.error("Could not end class");
    else {
      toast.success("Class ended");
      setActiveClass(null);
      await refresh();
    }
  }

  if (!me || !role) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading your learning space…</div>;
  }

  const isManager = role === "manager";
  const isStudent = role === "student";
  const assignedTeacherForAttendance = role === "teacher" ? me.id : attendanceTeacherId || teachers[0]?.id || "";
  const attendanceStudents = students.filter((student) => assignments.some((assignment) =>
    assignment.student_id === student.id && assignment.teacher_id === assignedTeacherForAttendance,
  ));
  const currentTeacherForHomework = role === "teacher" ? me.id : homeworkTeacherId || teachers[0]?.id || "";
  const currentTeacherForClass = role === "teacher" ? me.id : classTeacherId || teachers[0]?.id || "";
  const tabs = isStudent
    ? [{ id: "homework", label: "Homework", icon: BookOpen }, { id: "attendance", label: "Attendance", icon: CalendarDays }, { id: "classes", label: "Classes", icon: Video }]
    : isManager
      ? [{ id: "teachers", label: "Teachers", icon: Users }, { id: "students", label: "Students", icon: GraduationCap }, { id: "homework", label: "Homework", icon: BookOpen }, { id: "attendance", label: "Attendance", icon: CalendarDays }, { id: "classes", label: "Classes", icon: Video }]
      : [{ id: "students", label: "Students", icon: GraduationCap }, { id: "homework", label: "Homework", icon: BookOpen }, { id: "attendance", label: "Attendance", icon: CalendarDays }, { id: "classes", label: "Classes", icon: Video }];

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-hero text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <GraduationCap className="h-7 w-7 shrink-0 text-accent" />
            <div className="min-w-0">
              <p className="truncate font-display text-xl font-bold">Apex Learning Classes</p>
              <p className="text-xs text-primary-foreground/70">Rudhauli, Basti</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={signOut}><LogOut className="h-4 w-4" /> Sign out</Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-7 px-5 py-8 sm:px-6 sm:py-10">
        <div>
          <p className="text-sm font-semibold uppercase text-muted-foreground">{role}</p>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Welcome, {me.full_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{me.mobile}{me.subject ? ` · ${me.subject}` : ""}</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`grid h-auto w-full ${isManager ? "grid-cols-3 sm:grid-cols-5" : isStudent ? "grid-cols-3" : "grid-cols-4"}`}>
            {tabs.map(({ id, label, icon: Icon }) => (
              <TabsTrigger key={id} value={id} className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:gap-2 sm:px-3 sm:text-sm">
                <Icon className="h-4 w-4 shrink-0" /> <span className="truncate">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {!isStudent && (
            <TabsContent value="students" className="space-y-6 pt-4">
              <section className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                <form onSubmit={onAddStudent} className="space-y-4 rounded-md border bg-card p-5 sm:p-6">
                  <h2 className="flex items-center gap-2 text-xl font-bold"><UserPlus className="h-5 w-5" /> Add student</h2>
                  <div className="space-y-2"><Label htmlFor="student-name">Full name</Label><Input id="student-name" required value={studentForm.full_name} onChange={(event) => setStudentForm({ ...studentForm, full_name: event.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="student-mobile">Mobile number</Label><Input id="student-mobile" required inputMode="numeric" maxLength={10} value={studentForm.mobile} onChange={(event) => setStudentForm({ ...studentForm, mobile: event.target.value.replace(/\D/g, "") })} /></div>
                  <div className="space-y-2"><Label htmlFor="student-password">Initial password</Label><Input id="student-password" required minLength={6} autoComplete="new-password" type="password" value={studentForm.password} onChange={(event) => setStudentForm({ ...studentForm, password: event.target.value })} /></div>
                  {isManager && (
                    <div className="space-y-2">
                      <Label>Assign teacher</Label>
                      <Select value={studentForm.teacher_id} onValueChange={(value) => setStudentForm({ ...studentForm, teacher_id: value })}>
                        <SelectTrigger><SelectValue placeholder="Choose a teacher" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No teacher yet</SelectItem>
                          {teachers.map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{teacher.full_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating…" : "Create student account"}</Button>
                </form>

                <section className="rounded-md border bg-card p-5 sm:p-6">
                  <h2 className="mb-4 text-xl font-bold">Students <span className="text-muted-foreground">({students.length})</span></h2>
                  {students.length === 0 ? <p className="text-sm text-muted-foreground">No students assigned yet.</p> : (
                    <ul className="divide-y">
                      {students.map((student) => {
                        const assigned = assignments.find((item) => item.student_id === student.id)?.teacher_id ?? "none";
                        return (
                          <li key={student.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold">{student.full_name}</p>
                                <p className="text-sm text-muted-foreground">{student.mobile}</p>
                              </div>
                              <Button type="button" variant="outline" size="sm" onClick={() => {
                                setStudentPasswordTarget(student.id);
                                setTeacherPasswordTarget(null);
                                setNewPassword("");
                                setShowNewPassword(false);
                              }}><KeyRound className="h-4 w-4" /> Reset password</Button>
                            </div>
                            {isManager && (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold text-muted-foreground">Teacher</span>
                                <Select value={assigned} onValueChange={(value) => void onAssignStudent(student.id, value)}>
                                  <SelectTrigger className="h-9 w-full max-w-56"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Unassigned</SelectItem>
                                    {teachers.map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{teacher.full_name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            {studentPasswordTarget === student.id && (
                              <form onSubmit={(event) => void onSetPassword(event, student.id, "student")} className="flex flex-wrap gap-2">
                                <Input aria-label={`New password for ${student.full_name}`} type={showNewPassword ? "text" : "password"} minLength={6} required autoComplete="new-password" className="min-w-0 flex-1" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                                <Button type="button" variant="ghost" size="icon" aria-label={showNewPassword ? "Hide new password" : "Show new password"} onClick={() => setShowNewPassword((shown) => !shown)}>{showNewPassword ? <EyeOff /> : <Eye />}</Button>
                                <Button type="submit" size="sm" disabled={passwordBusy}>{passwordBusy ? "Saving…" : "Save"}</Button>
                                <Button type="button" variant="ghost" size="sm" onClick={() => setStudentPasswordTarget(null)}>Cancel</Button>
                              </form>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </section>
            </TabsContent>
          )}

          {isManager && (
            <TabsContent value="teachers" className="space-y-6 pt-4">
              <section className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                <form onSubmit={onAddTeacher} className="space-y-4 rounded-md border bg-card p-5 sm:p-6">
                  <h2 className="flex items-center gap-2 text-xl font-bold"><UserPlus className="h-5 w-5" /> Add teacher</h2>
                  <div className="space-y-2"><Label htmlFor="teacher-name">Full name</Label><Input id="teacher-name" required value={teacherForm.full_name} onChange={(event) => setTeacherForm({ ...teacherForm, full_name: event.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="teacher-mobile">Mobile number</Label><Input id="teacher-mobile" required inputMode="numeric" maxLength={10} value={teacherForm.mobile} onChange={(event) => setTeacherForm({ ...teacherForm, mobile: event.target.value.replace(/\D/g, "") })} /></div>
                  <div className="space-y-2"><Label htmlFor="teacher-subject">Subject</Label><Input id="teacher-subject" value={teacherForm.subject} onChange={(event) => setTeacherForm({ ...teacherForm, subject: event.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="teacher-password">Initial password</Label><div className="flex gap-2"><Input id="teacher-password" required minLength={6} autoComplete="new-password" type={teacherPasswordVisible ? "text" : "password"} value={teacherForm.password} onChange={(event) => setTeacherForm({ ...teacherForm, password: event.target.value })} /><Button type="button" variant="ghost" size="icon" aria-label={teacherPasswordVisible ? "Hide teacher password" : "Show teacher password"} onClick={() => setTeacherPasswordVisible((shown) => !shown)}>{teacherPasswordVisible ? <EyeOff /> : <Eye />}</Button></div></div>
                  <Button type="submit" className="w-full" disabled={busy}>{busy ? "Adding…" : "Add teacher"}</Button>
                </form>
                <section className="rounded-md border bg-card p-5 sm:p-6">
                  <h2 className="mb-4 text-xl font-bold">Teachers <span className="text-muted-foreground">({teachers.length})</span></h2>
                  {teachers.length === 0 ? <p className="text-sm text-muted-foreground">No teachers yet.</p> : (
                    <ul className="divide-y">
                      {teachers.map((teacher) => (
                        <li key={teacher.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div><p className="font-semibold">{teacher.full_name}</p><p className="text-sm text-muted-foreground">{teacher.mobile}{teacher.subject ? ` · ${teacher.subject}` : ""}</p></div>
                            <div className="flex items-center gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => { setTeacherPasswordTarget(teacher.id); setStudentPasswordTarget(null); setNewPassword(""); }}><KeyRound className="h-4 w-4" /> Reset password</Button>
                              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${teacher.full_name}`} onClick={() => void onRemoveTeacher(teacher.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </div>
                          </div>
                          {teacherPasswordTarget === teacher.id && (
                            <form onSubmit={(event) => void onSetPassword(event, teacher.id, "teacher")} className="flex flex-wrap gap-2">
                              <Input aria-label={`New password for ${teacher.full_name}`} type={showNewPassword ? "text" : "password"} minLength={6} required autoComplete="new-password" className="min-w-0 flex-1" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                              <Button type="button" variant="ghost" size="icon" aria-label={showNewPassword ? "Hide new password" : "Show new password"} onClick={() => setShowNewPassword((shown) => !shown)}>{showNewPassword ? <EyeOff /> : <Eye />}</Button>
                              <Button type="submit" size="sm" disabled={passwordBusy}>{passwordBusy ? "Saving…" : "Save"}</Button>
                              <Button type="button" variant="ghost" size="sm" onClick={() => setTeacherPasswordTarget(null)}>Cancel</Button>
                            </form>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </section>
            </TabsContent>
          )}

          <TabsContent value="homework" className="space-y-6 pt-4">
            {!isStudent && (
              <form onSubmit={onAddHomework} className="grid gap-4 rounded-md border bg-card p-5 md:grid-cols-2 sm:p-6">
                <h2 className="flex items-center gap-2 text-xl font-bold md:col-span-2"><BookOpen className="h-5 w-5" /> Send homework</h2>
                <div className="space-y-2"><Label htmlFor="homework-title">Title</Label><Input id="homework-title" required value={homeworkForm.title} onChange={(event) => setHomeworkForm({ ...homeworkForm, title: event.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="homework-subject">Subject</Label><Input id="homework-subject" value={homeworkForm.subject} onChange={(event) => setHomeworkForm({ ...homeworkForm, subject: event.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="homework-due">Due date</Label><Input id="homework-due" type="datetime-local" value={homeworkForm.due_at} onChange={(event) => setHomeworkForm({ ...homeworkForm, due_at: event.target.value })} /></div>
                <div className="space-y-2 md:row-span-2"><Label htmlFor="homework-instructions">Instructions</Label><Textarea id="homework-instructions" rows={4} value={homeworkForm.instructions} onChange={(event) => setHomeworkForm({ ...homeworkForm, instructions: event.target.value })} /></div>
                {isManager && (
                  <div className="space-y-2"><Label>Teacher</Label><Select value={currentTeacherForHomework} onValueChange={setHomeworkTeacherId}><SelectTrigger><SelectValue placeholder="Choose a teacher" /></SelectTrigger><SelectContent>{teachers.map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{teacher.full_name}</SelectItem>)}</SelectContent></Select></div>
                )}
                <Button type="submit" disabled={busy || (isManager && teachers.length === 0)} className="md:col-span-2">{busy ? "Sending…" : "Post homework"}</Button>
              </form>
            )}
            <section className="rounded-md border bg-card p-5 sm:p-6">
              <h2 className="mb-4 text-xl font-bold">{isStudent ? "Your homework" : "Homework assignments"}</h2>
              {homework.length === 0 ? <p className="text-sm text-muted-foreground">No homework has been posted yet.</p> : (
                <ul className="divide-y">
                  {homework.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold">{item.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{[item.subject, item.due_at ? `Due ${new Date(item.due_at).toLocaleString()}` : null].filter(Boolean).join(" · ") || "No due date"}</p>
                        {item.instructions && <p className="mt-2 whitespace-pre-wrap text-sm">{item.instructions}</p>}
                      </div>
                      {!isStudent && <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${item.title}`} onClick={() => void onDeleteHomework(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </TabsContent>

          <TabsContent value="attendance" className="space-y-6 pt-4">
            {isStudent ? (
              <section className="rounded-md border bg-card p-5 sm:p-6">
                <h2 className="mb-4 text-xl font-bold">Your attendance</h2>
                {attendance.length === 0 ? <p className="text-sm text-muted-foreground">No attendance has been recorded yet.</p> : (
                  <ul className="divide-y">{attendance.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-3"><span>{new Date(`${item.attendance_date}T12:00:00`).toLocaleDateString()}</span><span className="font-semibold capitalize">{item.status}</span></li>)}</ul>
                )}
              </section>
            ) : (
              <section className="space-y-4 rounded-md border bg-card p-5 sm:p-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div><h2 className="text-xl font-bold">Mark attendance</h2><p className="mt-1 text-sm text-muted-foreground">Choose each student’s status for the selected date.</p></div>
                  <div className="flex flex-wrap gap-3">
                    {isManager && <div className="w-48 space-y-1"><Label>Teacher</Label><Select value={assignedTeacherForAttendance} onValueChange={setAttendanceTeacherId}><SelectTrigger><SelectValue placeholder="Choose teacher" /></SelectTrigger><SelectContent>{teachers.map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{teacher.full_name}</SelectItem>)}</SelectContent></Select></div>}
                    <div className="w-40 space-y-1"><Label htmlFor="attendance-date">Date</Label><Input id="attendance-date" type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /></div>
                  </div>
                </div>
                {attendanceStudents.length === 0 ? <p className="border-t pt-4 text-sm text-muted-foreground">Assign students to a teacher to record attendance.</p> : (
                  <ul className="divide-y border-t">
                    {attendanceStudents.map((student) => {
                      const existing = attendance.find((row) => row.student_id === student.id && row.attendance_date === attendanceDate);
                      const value = attendanceDrafts[student.id] ?? (existing && isAttendanceStatus(existing.status) ? existing.status : "present");
                      return (
                        <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                          <div><p className="font-semibold">{student.full_name}</p><p className="text-sm text-muted-foreground">{student.mobile}</p></div>
                          <div className="flex items-center gap-2">
                            <Select value={value} onValueChange={(next) => { if (isAttendanceStatus(next)) setAttendanceDrafts((current) => ({ ...current, [student.id]: next })); }}>
                              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>{attendanceStatuses.map((status) => <SelectItem key={status} value={status} className="capitalize">{status}</SelectItem>)}</SelectContent>
                            </Select>
                            <Button type="button" size="icon" aria-label={`Save attendance for ${student.full_name}`} onClick={() => void onMarkAttendance(student.id)}><Check className="h-4 w-4" /></Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}
          </TabsContent>

          <TabsContent value="classes" className="space-y-6 pt-4">
            {!isStudent && (
              <form onSubmit={onCreateClass} className="grid gap-4 rounded-md border bg-card p-5 md:grid-cols-2 sm:p-6">
                <h2 className="flex items-center gap-2 text-xl font-bold md:col-span-2"><Video className="h-5 w-5" /> Schedule a live class</h2>
                <div className="space-y-2"><Label htmlFor="class-title">Class title</Label><Input id="class-title" required value={classForm.title} onChange={(event) => setClassForm({ ...classForm, title: event.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="class-time">Date and time</Label><Input id="class-time" required type="datetime-local" value={classForm.starts_at} onChange={(event) => setClassForm({ ...classForm, starts_at: event.target.value })} /></div>
                <div className="space-y-2 md:col-span-2"><Label htmlFor="class-description">Details</Label><Textarea id="class-description" rows={2} value={classForm.description} onChange={(event) => setClassForm({ ...classForm, description: event.target.value })} /></div>
                {isManager && <div className="space-y-2 md:col-span-2"><Label>Teacher</Label><Select value={currentTeacherForClass} onValueChange={setClassTeacherId}><SelectTrigger><SelectValue placeholder="Choose a teacher" /></SelectTrigger><SelectContent>{teachers.map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{teacher.full_name}</SelectItem>)}</SelectContent></Select></div>}
                <Button type="submit" disabled={busy || (isManager && teachers.length === 0)} className="md:col-span-2">{busy ? "Scheduling…" : "Schedule class"}</Button>
              </form>
            )}
            <section className="rounded-md border bg-card p-5 sm:p-6">
              <h2 className="mb-4 text-xl font-bold">{isStudent ? "Your classes" : "Scheduled classes"}</h2>
              {classes.length === 0 ? <p className="text-sm text-muted-foreground">No classes have been scheduled yet.</p> : (
                <ul className="divide-y">
                  {classes.map((item) => {
                    const host = role === "teacher" && item.teacher_id === me.id;
                    const canJoin = item.status === "live" && (isStudent || (role === "manager" && !activeClass));
                    return (
                      <li key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{item.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{new Date(item.starts_at).toLocaleString()} · <span className="capitalize">{item.status}</span></p>
                          {item.description && <p className="mt-2 whitespace-pre-wrap text-sm">{item.description}</p>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {host && item.status === "scheduled" && <Button type="button" size="sm" onClick={() => void startClass(item)}><Radio className="h-4 w-4" /> Start class</Button>}
                          {host && item.status === "live" && <Button type="button" size="sm" onClick={() => setActiveClass(item)}><Video className="h-4 w-4" /> Open room</Button>}
                          {canJoin && <Button type="button" size="sm" onClick={() => setActiveClass(item)}><Video className="h-4 w-4" /> Join class</Button>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {activeClass && (
                <LiveClassRoom
                  classId={activeClass.id}
                  classTitle={activeClass.title}
                  teacherId={activeClass.teacher_id}
                  userId={me.id}
                  isHost={activeClass.teacher_id === me.id && role === "teacher"}
                  onLeave={() => setActiveClass(null)}
                  onEndClass={() => void endClass()}
                  onRecordingSaved={() => void refresh()}
                />
              )}
            </section>

            <section className="rounded-md border bg-card p-5 sm:p-6">
              <h2 className="mb-4 text-xl font-bold">Class recordings</h2>
              {recordings.length === 0 ? <p className="text-sm text-muted-foreground">Recordings will appear here after a teacher saves a class recording.</p> : (
                <ul className="divide-y">
                  {recordings.map((recording) => {
                    const className = classes.find((item) => item.id === recording.class_id)?.title ?? "Class recording";
                    return (
                      <li key={recording.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div><p className="font-semibold">{className}</p><p className="text-sm text-muted-foreground">{new Date(recording.created_at).toLocaleString()} · {Math.ceil(recording.duration_seconds / 60)} min</p></div>
                          <a className="text-sm font-semibold text-primary underline-offset-4 hover:underline" href={recordingUrls[recording.id] || undefined} target="_blank" rel="noreferrer">Open recording</a>
                        </div>
                        {recordingUrls[recording.id] && <video controls preload="metadata" className="w-full max-w-2xl rounded-md bg-muted" src={recordingUrls[recording.id]} />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}