import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mobileToEmail, isValidMobile, isValidPassword } from "./staff";

// Makes sure the manager account exists. Never returns credentials.
export const ensureManager = createServerFn({ method: "POST" })
  .inputValidator((d: { mobile: string }) => ({ mobile: String(d.mobile).replace(/\D/g, "") }))
  .handler(async ({ data }) => {
    const mobile = process.env["MANAGER_MOBILE"];
    const password = process.env["MANAGER_PASSWORD"];
    if (!mobile || !password || data.mobile !== mobile) return { ok: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("profiles").select("id").eq("mobile", mobile).maybeSingle();
    if (existing) return { ok: true };
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: mobileToEmail(mobile), password, email_confirm: true,
    });
    if (error || !created.user) return { ok: false };
    await supabaseAdmin.from("profiles").insert({ id: created.user.id, full_name: "Manager", mobile });
    await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: "manager" });
    return { ok: true };
  });

export async function assertManager(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "manager" });
  if (!data) throw new Error("Only the manager can do this");
}

export async function assertTeacher(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "teacher" });
  if (!data) throw new Error("Only a teacher can do this");
}

export async function assertStaff(supabase: any, userId: string): Promise<"manager" | "teacher"> {
  const { data: manager } = await supabase.rpc("has_role", { _user_id: userId, _role: "manager" });
  if (manager) return "manager";
  const { data: teacher } = await supabase.rpc("has_role", { _user_id: userId, _role: "teacher" });
  if (teacher) return "teacher";
  throw new Error("Only the manager or a teacher can add students");
}

export const addTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { full_name: string; mobile: string; subject: string; password: string }) => {
    const mobile = String(d.mobile).replace(/\D/g, "");
    if (!d.full_name?.trim()) throw new Error("Name is required");
    if (!isValidMobile(mobile)) throw new Error("Enter a valid 10-digit mobile number");
    if (!isValidPassword(d.password)) throw new Error("Password must be at least 6 characters");
    return { full_name: d.full_name.trim(), mobile, subject: (d.subject ?? "").trim(), password: d.password };
  })
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: mobileToEmail(data.mobile), password: data.password, email_confirm: true,
    });
    if (error) console.error("createUser", error.message);
    if (error || !created.user) throw new Error(error?.message.includes("already") ? "This mobile number is already registered" : error?.message.includes("weak") ? "Password is too easy to guess. Choose a stronger one." : "Could not create teacher");
    await supabaseAdmin.from("profiles").insert({ id: created.user.id, full_name: data.full_name, mobile: data.mobile, subject: data.subject || null });
    await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: "teacher" });
    return { ok: true };
  });

export const setTeacherPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; password: string }) => {
    const id = String(d.id ?? "").trim();
    const password = String(d.password ?? "");
    if (!id) throw new Error("Teacher account not found");
    if (!isValidPassword(password)) throw new Error("Password must be at least 6 characters");
    return { id, password };
  })
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId);
    const { data: teacherRole, error: roleError } = await context.supabase
      .from("user_roles")
      .select("user_id")
      .eq("user_id", data.id)
      .eq("role", "teacher")
      .maybeSingle();
    if (roleError || !teacherRole) throw new Error("Teacher account not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      password: data.password,
    });
    if (error) {
      console.error("updateUserById", error.message);
      throw new Error("Could not update teacher password");
    }
    return { ok: true };
  });

export const removeTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId);
    if (data.id === context.userId) throw new Error("You cannot remove yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.auth.admin.deleteUser(data.id);
    return { ok: true };
  });

export const addStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { full_name: string; mobile: string; password: string; teacher_id?: string | null }) => {
    const fullName = String(d.full_name ?? "").trim();
    const mobile = String(d.mobile ?? "").replace(/\D/g, "");
    const teacherId = String(d.teacher_id ?? "").trim() || null;
    const password = String(d.password ?? "");
    if (!fullName) throw new Error("Name is required");
    if (!isValidMobile(mobile)) throw new Error("Enter a valid 10-digit mobile number");
    if (!isValidPassword(password)) throw new Error("Password must be at least 6 characters");
    return { full_name: fullName, mobile, password, teacher_id: teacherId };
  })
  .handler(async ({ data, context }) => {
    const actorRole = await assertStaff(context.supabase, context.userId);
    const teacherId = actorRole === "manager" ? data.teacher_id : context.userId;
    if (actorRole === "manager" && teacherId) {
      const { data: isTeacher } = await context.supabase.rpc("has_role", { _user_id: teacherId, _role: "teacher" });
      if (!isTeacher) throw new Error("Choose a valid teacher");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: mobileToEmail(data.mobile), password: data.password, email_confirm: true,
    });
    if (error || !created.user) {
      throw new Error(error?.message.includes("already") ? "This mobile number is already registered" : "Could not create student");
    }

    const studentId = created.user.id;
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: studentId, full_name: data.full_name, mobile: data.mobile,
    });
    const { error: roleError } = profileError
      ? { error: profileError }
      : await supabaseAdmin.from("user_roles").insert({ user_id: studentId, role: "student" });
    const { error: assignmentError } = roleError || !teacherId
      ? { error: null }
      : await supabaseAdmin.from("student_teacher_assignments").insert({
        student_id: studentId, teacher_id: teacherId, assigned_by: context.userId,
      });

    if (profileError || roleError || assignmentError) {
      await supabaseAdmin.auth.admin.deleteUser(studentId);
      console.error("student account setup failed", profileError?.message ?? roleError?.message ?? assignmentError?.message);
      throw new Error("Could not finish creating the student account");
    }
    return { ok: true };
  });

export const assignStudentToTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { student_id: string; teacher_id?: string | null }) => ({
    student_id: String(d.student_id ?? "").trim(),
    teacher_id: String(d.teacher_id ?? "").trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId);
    if (!data.student_id) throw new Error("Student account not found");
    const { data: isStudent } = await context.supabase.rpc("has_role", { _user_id: data.student_id, _role: "student" });
    if (!isStudent) throw new Error("Student account not found");
    if (data.teacher_id) {
      const { data: isTeacher } = await context.supabase.rpc("has_role", { _user_id: data.teacher_id, _role: "teacher" });
      if (!isTeacher) throw new Error("Choose a valid teacher");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.teacher_id) {
      const { error } = await supabaseAdmin.from("student_teacher_assignments").upsert({
        student_id: data.student_id, teacher_id: data.teacher_id, assigned_by: context.userId,
      }, { onConflict: "student_id,teacher_id" });
      if (error) throw new Error("Could not assign the student");
      const { error: removeError } = await supabaseAdmin.from("student_teacher_assignments")
        .delete().eq("student_id", data.student_id).neq("teacher_id", data.teacher_id);
      if (removeError) throw new Error("The new teacher was added, but old assignments could not be removed");
    } else {
      const { error } = await supabaseAdmin.from("student_teacher_assignments").delete().eq("student_id", data.student_id);
      if (error) throw new Error("Could not remove the student's teacher assignment");
    }
    return { ok: true };
  });

export const setStudentPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; password: string }) => {
    const id = String(d.id ?? "").trim();
    const password = String(d.password ?? "");
    if (!id) throw new Error("Student account not found");
    if (!isValidPassword(password)) throw new Error("Password must be at least 6 characters");
    return { id, password };
  })
  .handler(async ({ data, context }) => {
    const { data: manager } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "manager" });
    if (!manager) {
      await assertTeacher(context.supabase, context.userId);
      const { data: assignment, error } = await context.supabase.from("student_teacher_assignments")
        .select("student_id").eq("student_id", data.id).eq("teacher_id", context.userId).maybeSingle();
      if (error || !assignment) throw new Error("This student is not assigned to you");
    } else {
      const { data: isStudent } = await context.supabase.rpc("has_role", { _user_id: data.id, _role: "student" });
      if (!isStudent) throw new Error("Student account not found");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, { password: data.password });
    if (error) {
      console.error("updateStudentPassword", error.message);
      throw new Error("Could not update student password");
    }
    return { ok: true };
  });
