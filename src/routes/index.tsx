import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { GraduationCap, MapPin, ShieldCheck, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mobileToEmail, isValidMobile } from "@/lib/staff";
import { ensureManager } from "@/lib/staff.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Apex Learning Classes, Rudhauli — Staff Login" },
      { name: "description", content: "Teacher and manager login for Apex Learning Classes, Rudhauli, Basti." },
      { property: "og:title", content: "Apex Learning Classes, Rudhauli — Staff Login" },
      { property: "og:description", content: "Teacher and manager login for Apex Learning Classes, Rudhauli, Basti." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [role, setRole] = useState<"teacher" | "manager">("teacher");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidMobile(mobile)) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }
    setBusy(true);
    try {
      if (role === "manager") await ensureManager({ data: { mobile } });
      const { data, error } = await supabase.auth.signInWithPassword({ email: mobileToEmail(mobile), password });
      if (error || !data.user) throw new Error("Wrong mobile number or password");
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      if (!roles?.some((r) => r.role === role)) {
        await supabase.auth.signOut();
        throw new Error(`This account is not a ${role} account`);
      }
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-hero text-primary-foreground">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-2">
        <section>
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 px-4 py-1.5 text-sm">
            <MapPin className="h-4 w-4 text-accent" /> Rudhauli, Basti, Uttar Pradesh
          </div>
          <h1 className="text-5xl font-bold leading-tight md:text-6xl">
            Apex Learning <span className="text-accent">Classes</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-primary-foreground/75">
            The staff portal for our teachers and management. Sign in to manage classes and your team.
          </p>
          <div className="mt-10 grid max-w-md grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-3"><BookOpen className="h-5 w-5 text-accent" /> Teacher access</div>
            <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-accent" /> Manager controls</div>
          </div>
        </section>

        <section className="rounded-2xl bg-card p-8 text-card-foreground shadow-card">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-accent p-2.5 text-accent-foreground"><GraduationCap className="h-6 w-6" /></div>
            <div>
              <h2 className="text-2xl font-bold">Staff login</h2>
              <p className="text-sm text-muted-foreground">Use your registered mobile number</p>
            </div>
          </div>
          <Tabs value={role} onValueChange={(v) => setRole(v as "teacher" | "manager")} className="mb-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="teacher">Teacher</TabsTrigger>
              <TabsTrigger value="manager">Manager</TabsTrigger>
            </TabsList>
          </Tabs>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mobile">Mobile number</Label>
              <Input id="mobile" inputMode="numeric" maxLength={10} placeholder="10-digit mobile" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy ? "Signing in…" : `Sign in as ${role === "teacher" ? "Teacher" : "Manager"}`}
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-muted-foreground">Teacher accounts are created by the manager.</p>
        </section>
      </div>
    </main>
  );
}
