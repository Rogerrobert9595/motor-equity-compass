import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import "@lovable.dev/cloud-auth-js/styles.css";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export type AuthMode = "signin" | "signup" | "forgot";

/** Email/password sign in + sign up (with Google / Lovable as shortcuts). Used by the /auth page and the desk's sign-in modal. */
export function AuthForm({ mode, onModeChange, idPrefix = "auth" }: { mode: AuthMode; onModeChange: (m: AuthMode) => void; idPrefix?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        toast.success("Signed in");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setNotice("Check your email and tap the link to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setNotice("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const social = async (provider: "google" | "lovable") => {
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (result.error) toast.error("Sign-in didn't finish. Try again.");
  };

  return (
    <div>
      {mode !== "forgot" && (
        <Tabs value={mode} onValueChange={(v) => { setNotice(null); onModeChange(v as AuthMode); }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-email`}>Email</Label>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 text-base"
          />
        </div>
        {mode !== "forgot" && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={`${idPrefix}-password`}>Password</Label>
              {mode === "signin" && (
                <button type="button" className="text-xs text-primary" onClick={() => onModeChange("forgot")}>
                  Forgot password?
                </button>
              )}
            </div>
            <Input
              id={`${idPrefix}-password`}
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 text-base"
            />
          </div>
        )}
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </Button>
        {notice && <p className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">{notice}</p>}
        {mode === "forgot" && (
          <button type="button" className="w-full text-sm text-muted-foreground" onClick={() => onModeChange("signin")}>
            Back to sign in
          </button>
        )}
      </form>

      {mode !== "forgot" && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-2">
            <Button type="button" variant="secondary" className="h-11 w-full" onClick={() => void social("google")}>
              <GoogleMark /> Continue with Google
            </Button>
            <button type="button" className="lovable-auth-button w-full" onClick={() => void social("lovable")}>
              Continue with Lovable
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4Z" />
    </svg>
  );
}
