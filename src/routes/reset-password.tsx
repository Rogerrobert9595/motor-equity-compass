import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password – Deal Desk" },
      { name: "description", content: "Choose a new password for your Deal Desk account." },
      { property: "og:title", content: "Set a new password – Deal Desk" },
      { property: "og:description", content: "Choose a new password for your Deal Desk account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [validLink, setValidLink] = useState<boolean | null>(null);

  useEffect(() => {
    const isRecovery = window.location.hash.includes("type=recovery") || window.location.search.includes("code=");
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (isRecovery && session)) setValidLink(true);
    });
    void supabase.auth.getSession().then(({ data }) => {
      setValidLink((prev) => prev || isRecovery || !!data.session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated");
    void navigate({ to: "/", replace: true });
  };

  return (
    <div className="mx-auto max-w-sm px-5 pt-[calc(3rem+env(safe-area-inset-top))]">
      <h1 className="text-2xl font-semibold">Set a new password</h1>
      {validLink === false ? (
        <p className="mt-3 text-sm text-muted-foreground">This reset link has expired. Request a new one from the sign-in page.</p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 text-base"
            />
          </div>
          <Button type="submit" className="h-11 w-full" disabled={busy || validLink === null}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Save password
          </Button>
        </form>
      )}
    </div>
  );
}
