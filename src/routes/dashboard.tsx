import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { LogOut, Trash2, UserPlus, GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addTeacher, removeTeacher } from "@/lib/staff.functions";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Apex Learning Classes" },
      { name: "description", content: "Staff dashboard for Apex Learning Classes, Rudhauli." },
      { property: "og:title", content: "Dashboard — Apex Learning Classes" },
      { property: "og:description", content: "Staff dashboard for Apex Learning Classes, Rudhauli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

type Profile = { id: string; full_name: string; mobile: string; subject: string | null };

function Dashboard() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Profile | null>(null);
  const [isManager, setIsManager] = useState(false);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [form, setForm] = useState({ full_name: "", mobile: "", subject: "", password: "" });
  const [busy, setBusy] = useState(false);

  const loadTeachers = useCallback(async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "teacher");
    const ids = (roles ?? []).map((r) => r.user_id);
    if (!ids.length) return setTeachers([]);
    const { data } = await supabase.from("profiles").select("*").in("id", ids).order("full_name");
    setTeachers(data ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return navigate({ to: "/" });
      const [{ data: prof }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      setMe(prof);
      const mgr = !!roles?.some((r) => r.role === "manager");
      setIsManager(mgr);
      if (mgr) loadTeachers();
    })();
  }, [navigate, loadTeachers]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await addTeacher({ data: form });
      toast.success("Teacher added");
      setForm({ full_name: "", mobile: "", subject: "", password: "" });
      loadTeachers();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(id: string) {
    if (!confirm("Remove this teacher?")) return;
    try {
      await removeTeacher({ data: { id } });
      toast.success("Teacher removed");
      loadTeachers();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (!me) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-hero text-primary-foreground">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-7 w-7 text-accent" />
            <div>
              <p className="font-display text-xl font-bold">Apex Learning Classes</p>
              <p className="text-xs text-primary-foreground/70">Rudhauli, Basti</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={signOut}><LogOut className="h-4 w-4" /> Sign out</Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-accent-foreground/70">{isManager ? "Manager" : "Teacher"}</p>
          <h1 className="text-4xl font-bold">Welcome, {me.full_name}</h1>
          <p className="mt-1 text-muted-foreground">Mobile: {me.mobile}{me.subject ? ` · Subject: ${me.subject}` : ""}</p>
        </div>

        {isManager ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <form onSubmit={onAdd} className="space-y-4 rounded-2xl border bg-card p-6 shadow-card">
              <h2 className="flex items-center gap-2 text-xl font-bold"><UserPlus className="h-5 w-5" /> Add teacher</h2>
              <div className="space-y-2"><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Mobile number</Label><Input inputMode="numeric" maxLength={10} value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "") })} /></div>
              <div className="space-y-2"><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
              <div className="space-y-2"><Label>Password</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Adding…" : "Add teacher"}</Button>
            </form>
            <section className="rounded-2xl border bg-card p-6">
              <h2 className="mb-4 text-xl font-bold">Teachers ({teachers.length})</h2>
              {teachers.length === 0 ? (
                <p className="text-muted-foreground">No teachers yet. Add your first teacher.</p>
              ) : (
                <ul className="divide-y">
                  {teachers.map((t) => (
                    <li key={t.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-semibold">{t.full_name}</p>
                        <p className="text-sm text-muted-foreground">{t.mobile}{t.subject ? ` · ${t.subject}` : ""}</p>
                      </div>
                      <Button variant="ghost" size="icon" aria-label="Remove teacher" onClick={() => onRemove(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : (
          <section className="rounded-2xl border bg-card p-8 shadow-card">
            <h2 className="text-2xl font-bold">Your teacher portal</h2>
            <p className="mt-2 text-muted-foreground">You are signed in to Apex Learning Classes, Rudhauli. Contact the manager for any changes to your account.</p>
          </section>
        )}
      </main>
    </div>
  );
}
