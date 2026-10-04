import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MessageSquare, ShieldCheck, CheckCircle2,
  ArrowRight, Loader2, Sparkles, LogOut, Check, Building2, Smartphone,
  Key, Hash, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/whatsapp-integration")({
  component: WhatsAppIntegrationPage,
  head: () => ({ meta: [{ title: "WhatsApp Integration · JewelMind AI" }] }),
});

function WhatsAppIntegrationPage() {
  const [businessName, setBusinessName] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [showToken, setShowToken] = useState(false);

  const [config, setConfig] = useState<{
    business_name: string;
    business_number: string;
    business_account_id?: string;
    phone_number_id?: string;
    status: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Simulated OAuth popup state
  const [oauthStep, setOauthStep] = useState<number>(0);
  const [oauthProgress, setOauthProgress] = useState(0);

  const fetchStatus = () => {
    setLoading(true);
    const token = localStorage.getItem("access_token") || "";
    fetch("/api/whatsapp-config/status", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        setConfig(data);
        if (data.status === "Connected") {
          setBusinessName(data.business_name);
          setBusinessNumber(data.business_number);
        }
      })
      .catch(() => toast.error("Failed to load WhatsApp connection details."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    const token = localStorage.getItem("access_token") || "";
    try {
      const res = await fetch("/api/whatsapp-config/disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to disconnect" }));
        throw new Error(err.detail);
      }
      toast.success("Successfully disconnected Meta WhatsApp account.");
      setBusinessName(""); setBusinessNumber("");
      setAccessToken(""); setPhoneNumberId(""); setBusinessAccountId("");
      fetchStatus();
    } catch (e: any) {
      toast.error(e.message || "Could not disconnect account.");
    } finally {
      setDisconnecting(false);
    }
  };

  const startOAuthSimulation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) { toast.error("Please enter a Business Name."); return; }
    if (!businessNumber.trim() || businessNumber.replace(/\D/g, "").length < 10) {
      toast.error("Please enter a valid 10-digit WhatsApp number."); return;
    }
    if (!accessToken.trim() || accessToken.length < 20) {
      toast.error("Please enter a valid WhatsApp Access Token from Meta Developer Portal."); return;
    }
    if (!phoneNumberId.trim()) {
      toast.error("Please enter your WhatsApp Phone Number ID from Meta Developer Portal."); return;
    }
    setConnecting(true);
    setOauthStep(1);
    setOauthProgress(0);
  };

  // Run simulated popup steps
  useEffect(() => {
    if (oauthStep === 0) return;
    let interval: NodeJS.Timeout;

    if (oauthStep === 1) {
      interval = setInterval(() => {
        setOauthProgress((p) => {
          if (p >= 100) { clearInterval(interval); setTimeout(() => { setOauthStep(2); setOauthProgress(0); }, 600); return 100; }
          return p + 10;
        });
      }, 150);
    } else if (oauthStep === 2) {
      interval = setInterval(() => {
        setOauthProgress((p) => {
          if (p >= 100) { clearInterval(interval); setTimeout(() => { setOauthStep(3); setOauthProgress(0); }, 600); return 100; }
          return p + 15;
        });
      }, 200);
    } else if (oauthStep === 3) {
      interval = setInterval(() => {
        setOauthProgress((p) => {
          if (p >= 100) { clearInterval(interval); setTimeout(() => { saveConnectionToDB(); }, 600); return 100; }
          return p + 20;
        });
      }, 180);
    }
    return () => clearInterval(interval);
  }, [oauthStep]);

  const saveConnectionToDB = async () => {
    const token = localStorage.getItem("access_token") || "";
    try {
      const res = await fetch("/api/whatsapp-config/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          business_name: businessName,
          business_number: businessNumber,
          access_token: accessToken,
          phone_number_id: phoneNumberId,
          business_account_id: businessAccountId || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Connection failed" }));
        throw new Error(err.detail);
      }
      const data = await res.json();
      setConfig(data);
      setOauthStep(4);
      toast.success("Meta WhatsApp account connected successfully!");
    } catch (e: any) {
      toast.error(e.message || "Failed to finalize WhatsApp connection.");
      setOauthStep(0);
      setConnecting(false);
    }
  };

  const closeOAuthModal = () => {
    setOauthStep(0);
    setConnecting(false);
    fetchStatus();
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--gold)]" />
      </div>
    );
  }

  const isConnected = config?.status === "Connected";

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      <PageHeader
        eyebrow="Integrations"
        title="WhatsApp Business Setup"
        description="Connect your Meta WhatsApp Cloud API credentials to send real messages to customers and run broadcast campaigns."
        actions={
          <Button variant="outline" asChild className="rounded-2xl border-border/60 hover:bg-secondary text-white">
            <Link to="/whatsapp">Go to WhatsApp Dashboard</Link>
          </Button>
        }
      />

      <div className="grid gap-8 md:grid-cols-[1fr,320px]">
        {/* Left: Connect form or status */}
        <div className="space-y-6">
          <Card className="bg-[#0B1437] text-white border-none shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-[var(--gold)]/5 blur-3xl pointer-events-none" />
            <CardHeader>
              <CardTitle className="text-xl font-serif text-[var(--gold)] flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                {isConnected ? "Meta WhatsApp Account Status" : "Connect Meta Business Account"}
              </CardTitle>
              <CardDescription className="text-white/70">
                {isConnected
                  ? "Your jewellery shop is active on WhatsApp Business Cloud API."
                  : "Enter your Meta Cloud API credentials to enable real WhatsApp messaging."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isConnected ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-4 bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl">
                    <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">Meta WhatsApp Connected</h4>
                      <p className="text-xs text-white/60">Verified Business Account actively linked</p>
                    </div>
                  </div>

                  <div className="grid gap-4 bg-white/5 border border-white/10 p-5 rounded-xl text-sm">
                    {[
                      { label: "Business Name", value: config?.business_name, icon: Building2 },
                      { label: "WhatsApp Number", value: config?.business_number, icon: Smartphone },
                      { label: "Phone Number ID", value: config?.phone_number_id || "Configured", icon: Hash },
                      { label: "Business Account ID", value: config?.business_account_id || "Configured", icon: Key },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="grid grid-cols-[160px,1fr] gap-1.5">
                        <span className="text-white/50">{label}:</span>
                        <span className="font-medium text-white flex items-center gap-1.5">
                          <Icon className="h-4 w-4 text-[var(--gold)] flex-shrink-0" />
                          <span className="font-mono text-xs truncate">{value}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <form onSubmit={startOAuthSimulation} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="business-name" className="text-white/80 flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-[var(--gold)]" /> Business Display Name *
                    </Label>
                    <Input
                      id="business-name"
                      placeholder="e.g. Malabar Gold & Diamonds"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="bg-white/5 border-white/20 text-white rounded-xl focus:border-[var(--gold)] focus:ring-1 focus:ring-[var(--gold)] placeholder:text-white/30"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="whatsapp-number" className="text-white/80 flex items-center gap-1.5">
                      <Smartphone className="h-3.5 w-3.5 text-[var(--gold)]" /> WhatsApp Business Number *
                    </Label>
                    <Input
                      id="whatsapp-number"
                      placeholder="e.g. +91 9876543210"
                      value={businessNumber}
                      onChange={(e) => setBusinessNumber(e.target.value)}
                      className="bg-white/5 border-white/20 text-white rounded-xl focus:border-[var(--gold)] focus:ring-1 focus:ring-[var(--gold)] placeholder:text-white/30"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone-number-id" className="text-white/80 flex items-center gap-1.5">
                      <Hash className="h-3.5 w-3.5 text-[var(--gold)]" /> Phone Number ID *
                    </Label>
                    <Input
                      id="phone-number-id"
                      placeholder="From Meta Developer Portal → WhatsApp → API Setup"
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      className="bg-white/5 border-white/20 text-white rounded-xl focus:border-[var(--gold)] focus:ring-1 focus:ring-[var(--gold)] placeholder:text-white/30 font-mono text-sm"
                      required
                    />
                    <p className="text-[10px] text-white/40">
                      Found at: Meta for Developers → Your App → WhatsApp → API Setup → Phone Number ID
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="business-account-id" className="text-white/80 flex items-center gap-1.5">
                      <Key className="h-3.5 w-3.5 text-[var(--gold)]" /> WhatsApp Business Account ID (optional)
                    </Label>
                    <Input
                      id="business-account-id"
                      placeholder="WABA ID (optional)"
                      value={businessAccountId}
                      onChange={(e) => setBusinessAccountId(e.target.value)}
                      className="bg-white/5 border-white/20 text-white rounded-xl focus:border-[var(--gold)] focus:ring-1 focus:ring-[var(--gold)] placeholder:text-white/30 font-mono text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="access-token" className="text-white/80 flex items-center gap-1.5">
                      <Key className="h-3.5 w-3.5 text-[var(--gold)]" /> Permanent Access Token *
                    </Label>
                    <div className="relative">
                      <Input
                        id="access-token"
                        type={showToken ? "text" : "password"}
                        placeholder="EAAxxxxxxxxxxxxxxxx… (from Meta System User)"
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                        className="bg-white/5 border-white/20 text-white rounded-xl focus:border-[var(--gold)] focus:ring-1 focus:ring-[var(--gold)] placeholder:text-white/30 pr-10 font-mono text-xs"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                      >
                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-white/40">
                      Use a <strong className="text-white/60">System User</strong> token from Meta Business Manager → Business Settings → System Users → Generate Token
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-[var(--gold)] hover:bg-[var(--gold)]/95 text-navy font-semibold py-6 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all"
                  >
                    <Sparkles className="h-4 w-4" />
                    Connect & Verify Meta WhatsApp
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </form>
              )}
            </CardContent>
            {isConnected && (
              <CardFooter className="border-t border-white/15 pt-5 flex justify-between">
                <p className="text-xs text-white/50">Status verified via Meta Cloud Graph API</p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="rounded-xl flex items-center gap-1.5"
                >
                  {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                  Disconnect Account
                </Button>
              </CardFooter>
            )}
          </Card>
        </div>

        {/* Right: Setup guide */}
        <div className="space-y-6">
          <Card className="bg-[#0B1437] text-white border-none shadow-xl relative overflow-hidden">
            <CardHeader>
              <CardTitle className="text-md text-[var(--gold)] font-serif flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> Setup Checklist
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs text-white/80">
              {[
                {
                  num: "1",
                  title: "Meta Business Account",
                  desc: "Create and verify a Meta Business Manager account at business.facebook.com",
                },
                {
                  num: "2",
                  title: "Create WhatsApp App",
                  desc: "Go to developers.facebook.com → Create App → Business type → Add WhatsApp product",
                },
                {
                  num: "3",
                  title: "Get Phone Number ID",
                  desc: "WhatsApp → API Setup → copy the Phone Number ID (all digits, no spaces)",
                },
                {
                  num: "4",
                  title: "Generate System User Token",
                  desc: "Business Settings → System Users → create user → Generate Token with whatsapp_business_messaging permission",
                },
                {
                  num: "5",
                  title: "Use a Clean Number",
                  desc: "The number must NOT be active on consumer WhatsApp or WhatsApp Business App — must be fresh",
                },
              ].map(({ num, title, desc }) => (
                <div key={num} className="flex gap-2">
                  <div className="h-5 w-5 rounded-full bg-[var(--gold)]/10 border border-[var(--gold)]/30 flex items-center justify-center text-[var(--gold)] font-bold text-[10px] flex-shrink-0">
                    {num}
                  </div>
                  <div>
                    <h5 className="font-semibold text-white">{title}</h5>
                    <p className="text-white/50 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Simulated OAuth Modal Overlay */}
      {oauthStep > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md bg-[#0F1C4E] border border-white/10 text-white shadow-2xl overflow-hidden rounded-2xl">
            <CardHeader className="bg-gradient-to-r from-blue-700/40 via-purple-700/20 to-transparent p-6 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-md">f</div>
                  <h3 className="font-bold text-lg tracking-tight">Verifying Meta Connection</h3>
                </div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                  Secure
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center justify-between text-xs text-white/50">
                <span className={oauthStep >= 1 ? "text-blue-400 font-semibold" : ""}>1. Auth</span>
                <span className="h-px bg-white/10 flex-1 mx-2" />
                <span className={oauthStep >= 2 ? "text-blue-400 font-semibold" : ""}>2. Account</span>
                <span className="h-px bg-white/10 flex-1 mx-2" />
                <span className={oauthStep >= 3 ? "text-blue-400 font-semibold" : ""}>3. Verify</span>
              </div>

              {oauthStep === 1 && (
                <div className="space-y-4 text-center py-6">
                  <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto" />
                  <div>
                    <h4 className="font-semibold text-white text-md">Authenticating with Meta...</h4>
                    <p className="text-xs text-white/60 mt-1">Validating access token and phone number ID</p>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/10">
                    <div className="bg-blue-600 h-2 rounded-full transition-all duration-150" style={{ width: `${oauthProgress}%` }} />
                  </div>
                </div>
              )}

              {oauthStep === 2 && (
                <div className="space-y-4 py-4 text-center">
                  <div className="h-10 w-10 bg-purple-500/20 text-purple-400 rounded-full flex items-center justify-center mx-auto">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-md">Retrieving WhatsApp Account</h4>
                    <p className="text-xs text-white/60 mt-1">
                      Found account for: <strong className="text-white">{businessName}</strong>
                    </p>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/10">
                    <div className="bg-purple-500 h-2 rounded-full transition-all duration-150" style={{ width: `${oauthProgress}%` }} />
                  </div>
                </div>
              )}

              {oauthStep === 3 && (
                <div className="space-y-4 text-center py-6">
                  <Loader2 className="h-10 w-10 animate-spin text-amber-500 mx-auto" />
                  <div>
                    <h4 className="font-semibold text-white text-md">Verifying Phone Number</h4>
                    <p className="text-xs text-white/60 mt-1">
                      Confirming: <strong className="text-white">{businessNumber}</strong>
                    </p>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/10">
                    <div className="bg-amber-500 h-2 rounded-full transition-all duration-150" style={{ width: `${oauthProgress}%` }} />
                  </div>
                </div>
              )}

              {oauthStep === 4 && (
                <div className="space-y-4 text-center py-4">
                  <div className="h-12 w-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                    <Check className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-emerald-400 text-lg">Connection Successful!</h4>
                    <p className="text-xs text-white/60 mt-1">
                      Meta Cloud API credentials saved. You can now send real WhatsApp messages.
                    </p>
                  </div>
                  <div className="bg-emerald-950/20 border border-emerald-500/20 p-4 rounded-xl text-left space-y-1.5 text-xs text-emerald-300">
                    <p>✓ Access Token Securely Stored</p>
                    <p>✓ Phone Number ID Configured: {phoneNumberId.slice(0, 8)}…</p>
                    <p>✓ Business Number Verified: {businessNumber}</p>
                    <p>✓ Broadcasts & campaigns now active</p>
                  </div>
                  <Button
                    onClick={closeOAuthModal}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl py-5"
                  >
                    Finish Setup
                  </Button>
                </div>
              )}
            </CardContent>
            {oauthStep < 4 && (
              <CardFooter className="bg-black/10 p-4 border-t border-white/10 flex justify-between text-[11px] text-white/40">
                <span>Meta WhatsApp Cloud API Verification</span>
                <span className="cursor-pointer hover:text-white/60" onClick={closeOAuthModal}>Cancel</span>
              </CardFooter>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
