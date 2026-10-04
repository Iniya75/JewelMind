import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { saveOwnerProfile } from "@/lib/api-service";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({ meta: [{ title: "Create account / Log in · JewelMind AI" }] }),
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [shopName, setShopName] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("access_token")) {
      navigate({ to: "/" });
    }
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "forgot") {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        });
        
        let data;
        try {
          data = await res.json();
        } catch {
          data = {};
        }
        
        if (!res.ok) {
          throw new Error(data.detail || "Request failed");
        }
        
        toast.success("Reset token generated! Check server console logs.");
        setMode("reset");
        return;
      }
      
      if (mode === "reset") {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, token: resetToken.trim(), new_password: newPassword })
        });
        
        let data;
        try {
          data = await res.json();
        } catch {
          data = {};
        }
        
        if (!res.ok) {
          throw new Error(data.detail || "Password reset failed");
        }
        
        toast.success("Password reset successfully! Please log in.");
        setMode("signin");
        return;
      }

      const endpoint = mode === "signup" ? "/register" : "/login";
      const payload = mode === "signup" 
        ? { email, password, name: name.trim() || "Owner", shop_name: shopName.trim() || "My Jewellery Shop" } 
        : { email, password };
      
      const res = await fetch(`/api/auth${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      let data;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text || "Server returned non-JSON response");
      }
      
      if (!res.ok) {
        if (data.detail === "password_reset_required") {
          toast.warning("Password reset required for migrated account.");
          // Trigger the forgot password logic automatically
          await fetch("/api/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
          }).catch(() => {});
          toast.info("A reset token has been printed to the server terminal. Please input it below.");
          setMode("reset");
          return;
        }
        throw new Error(data.detail || "Authentication failed");
      }
      
      localStorage.setItem("access_token", data.access_token);
      if (mode === "signup") {
        await saveOwnerProfile({
          ownerName: name.trim() || "Owner",
          shopName: shopName.trim() || "My Jewellery Shop",
        }).catch(() => {});
      }
      toast.success(mode === "signup" ? "Account created successfully" : "Welcome back");
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const getTitle = () => {
    switch (mode) {
      case "signin": return "Log in";
      case "signup": return "Create account";
      case "forgot": return "Reset Password";
      case "reset": return "Set New Password";
    }
  };

  const getSubtext = () => {
    switch (mode) {
      case "signin": return "Welcome back to JewelMind AI.";
      case "signup": return "Set up your boutique workspace.";
      case "forgot": return "Request a 6-digit verification code.";
      case "reset": return "Enter the verification code to set your new password.";
    }
  };

  return (
    <div className="grid min-h-screen w-full bg-background lg:grid-cols-2">
      <div className="hidden flex-col justify-between p-12 navy-gradient text-[var(--navy-foreground)] lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl gold-gradient text-navy">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="font-serif text-xl font-semibold">JewelMind</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--gold)]">AI · ERP · CRM</div>
          </div>
        </div>
        <div className="max-w-md">
          <h1 className="font-serif text-4xl leading-tight">
            Built exclusively for jewelry retailers.
          </h1>
          <p className="mt-4 text-white/75">
            Log in to manage customers, billing, gold rates, and AI-driven insights for your boutique.
          </p>
        </div>
        <div className="text-xs text-white/55">© {new Date().getFullYear()} JewelMind AI</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="luxe-card w-full max-w-md rounded-3xl border-border/60 p-8">
          <h2 className="font-serif text-3xl">{getTitle()}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{getSubtext()}</p>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            {mode === "signup" && (
              <>
                <div className="grid gap-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Owner Name</Label>
                  <Input placeholder="e.g. Rajesh Kumar" value={name} onChange={(e) => setName(e.target.value)} required className="rounded-xl" />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Jewellery Shop Name</Label>
                  <Input placeholder="e.g. Mahalakshmi Jewellers" value={shopName} onChange={(e) => setShopName(e.target.value)} required className="rounded-xl" />
                </div>
              </>
            )}
            
            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-xl" />
            </div>

            {mode === "reset" && (
              <div className="grid gap-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">6-Digit Reset Token</Label>
                <Input placeholder="e.g. 123456" value={resetToken} onChange={(e) => setResetToken(e.target.value)} required className="rounded-xl" />
              </div>
            )}

            {(mode === "signin" || mode === "signup") && (
              <div className="grid gap-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="rounded-xl" />
              </div>
            )}

            {mode === "reset" && (
              <div className="grid gap-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">New Password</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} className="rounded-xl" />
              </div>
            )}

            <Button type="submit" disabled={loading} className="mt-2 w-full rounded-2xl bg-[var(--gold)] text-navy hover:opacity-90">
              {loading ? "Please wait…" : 
               mode === "signin" ? "Log in" : 
               mode === "signup" ? "Create account" : 
               mode === "forgot" ? "Send Reset Token" : "Reset Password"}
            </Button>
          </form>

          {mode === "signin" && (
            <div className="mt-6 flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <p>
                Don't have an account?{" "}
                <button type="button" onClick={() => setMode("signup")} className="font-medium text-[var(--gold)] hover:underline">
                  Create account
                </button>
              </p>
              <button type="button" onClick={() => setMode("forgot")} className="text-xs text-[var(--gold)] hover:underline">
                Forgot password?
              </button>
            </div>
          )}

          {mode === "signup" && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <button type="button" onClick={() => setMode("signin")} className="font-medium text-[var(--gold)] hover:underline">
                Log in
              </button>
            </p>
          )}

          {(mode === "forgot" || mode === "reset") && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Back to{" "}
              <button type="button" onClick={() => setMode("signin")} className="font-medium text-[var(--gold)] hover:underline">
                Log in
              </button>
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
