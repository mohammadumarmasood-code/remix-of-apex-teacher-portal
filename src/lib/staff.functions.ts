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
