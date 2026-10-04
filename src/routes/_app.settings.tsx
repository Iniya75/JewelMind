import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Store, Bell, Zap, MessageSquare } from "lucide-react";
import { getOwnerProfile, saveOwnerProfile } from "@/lib/api-service";
import { useOwnerProfile } from "@/hooks/use-owner-profile";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings · JewelMind AI" }] }),
});

function SettingsPage() {
  const { refreshProfile } = useOwnerProfile();

  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [gstin, setGstin] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Preferences state (stored in localStorage)
  const [goldAlerts, setGoldAlerts] = useState(() => localStorage.getItem("pref_goldAlerts") === "true");
  const [weeklyBriefing, setWeeklyBriefing] = useState(() => localStorage.getItem("pref_weeklyBriefing") === "true");

  // WhatsApp settings state
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [whatsappStatus, setWhatsappStatus] = useState<"connected" | "not_connected" | "invalid_token">("not_connected");

  // WhatsApp Preferences
  const [prefFestival, setPrefFestival] = useState(false);
  const [prefInvoice, setPrefInvoice] = useState(false);
  const [prefPayment, setPrefPayment] = useState(false);
  const [prefNewCollection, setPrefNewCollection] = useState(false);
  const [prefBirthday, setPrefBirthday] = useState(false);
  const [prefOrderStatus, setPrefOrderStatus] = useState(false);

  const [loadingWhatsApp, setLoadingWhatsApp] = useState(true);
  const [connectingWhatsApp, setConnectingWhatsApp] = useState(false);
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [disconnectingWhatsApp, setDisconnectingWhatsApp] = useState(false);

  useEffect(() => {
    getOwnerProfile().then((profile) => {
      if (profile) {
        setShopName(profile.shopName ?? "");
        setOwnerName(profile.ownerName ?? "");
        setGstin(profile.gstin ?? "");
        setCity(profile.city ?? "");
        setPhone(profile.phone ?? "");
        setAddress(profile.address ?? "");
      }
      setLoading(false);
    }).catch(() => setLoading(false));

    // Fetch WhatsApp settings
    const token = localStorage.getItem("access_token");
    fetch("/api/whatsapp/settings", {
      headers: { Authorization: token ? `Bearer ${token}` : "" }
    })
      .then(res => res.json())
      .then(data => {
        if (data) {
          setPhoneNumberId(data.phone_number_id || "");
          setBusinessAccountId(data.business_account_id || "");
          setAccessToken(data.access_token || "");
          setVerifyToken(data.verify_token || "");
          setIsConnected(data.is_connected || false);
          setWebhookUrl(data.webhook_url || "");
          
          if (data.is_connected) {
            setWhatsappStatus("connected");
          } else if (data.access_token) {
            setWhatsappStatus("invalid_token");
          } else {
            setWhatsappStatus("not_connected");
          }
          
          setPrefFestival(data.festival_campaigns || false);
          setPrefInvoice(data.invoice_notifications || false);
          setPrefPayment(data.payment_reminders || false);
          setPrefNewCollection(data.new_collection_announcements || false);
          setPrefBirthday(data.birthday_wishes || false);
          setPrefOrderStatus(data.order_status_updates || false);
        }
        setLoadingWhatsApp(false);
      })
      .catch(() => setLoadingWhatsApp(false));
  }, []);

  async function handleConnectWhatsApp() {
    if (!phoneNumberId.trim() || !businessAccountId.trim() || !accessToken.trim() || !verifyToken.trim()) {
      toast.error("Please fill in all WhatsApp configuration fields.");
      return;
    }
    setConnectingWhatsApp(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch("/api/whatsapp/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          phone_number_id: phoneNumberId.trim(),
          business_account_id: businessAccountId.trim(),
          access_token: accessToken.trim(),
          verify_token: verifyToken.trim(),
          festival_campaigns: prefFestival,
          invoice_notifications: prefInvoice,
          payment_reminders: prefPayment,
          new_collection_announcements: prefNewCollection,
          birthday_wishes: prefBirthday,
          order_status_updates: prefOrderStatus,
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Connection failed");
      }
      setAccessToken(data.access_token || "");
      setVerifyToken(data.verify_token || "");
      setIsConnected(data.is_connected);
      if (data.is_connected) {
        setWhatsappStatus("connected");
        toast.success("WhatsApp Business account connected successfully!");
      } else {
        setWhatsappStatus("invalid_token");
        toast.error("Connected with an invalid token. Please check configuration.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to connect WhatsApp.");
    } finally {
      setConnectingWhatsApp(false);
    }
  }

  async function handleTestConnection() {
    if (!phoneNumberId.trim() || !businessAccountId.trim() || !accessToken.trim() || !verifyToken.trim()) {
      toast.error("Please fill in all WhatsApp configuration fields first.");
      return;
    }
    setTestingWhatsApp(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch("/api/whatsapp/settings/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          phone_number_id: phoneNumberId.trim(),
          business_account_id: businessAccountId.trim(),
          access_token: accessToken.trim(),
          verify_token: verifyToken.trim(),
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Connection test failed.");
      }
      toast.success("✓ WhatsApp connected successfully.");
    } catch (err: any) {
      toast.error(`✗ Invalid token or configuration: ${err.message}`);
    } finally {
      setTestingWhatsApp(false);
    }
  }

  async function handleDisconnectWhatsApp() {
    setDisconnectingWhatsApp(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch("/api/whatsapp/settings", {
        method: "DELETE",
        headers: { Authorization: token ? `Bearer ${token}` : "" }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Disconnection failed");
      }
      setPhoneNumberId("");
      setBusinessAccountId("");
      setAccessToken("");
      setVerifyToken("");
      setIsConnected(false);
      setWhatsappStatus("not_connected");
      toast.success("WhatsApp Business account disconnected.");
    } catch (err: any) {
      toast.error(err.message || "Failed to disconnect WhatsApp.");
    } finally {
      setDisconnectingWhatsApp(false);
    }
  }

  async function updateWhatsAppPref(key: string, val: boolean) {
    let f = prefFestival;
    let i = prefInvoice;
    let p = prefPayment;
    let n = prefNewCollection;
    let b = prefBirthday;
    let o = prefOrderStatus;
    
    if (key === "festival") f = val;
    else if (key === "invoice") i = val;
    else if (key === "payment") p = val;
    else if (key === "new_collection") n = val;
    else if (key === "birthday") b = val;
    else if (key === "order_status") o = val;
    
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch("/api/whatsapp/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          phone_number_id: phoneNumberId.trim() || null,
          business_account_id: businessAccountId.trim() || null,
          access_token: accessToken.trim() || null,
          verify_token: verifyToken.trim() || null,
          festival_campaigns: f,
          invoice_notifications: i,
          payment_reminders: p,
          new_collection_announcements: n,
          birthday_wishes: b,
          order_status_updates: o,
        })
      });
      if (res.ok) {
        if (key === "festival") setPrefFestival(val);
        else if (key === "invoice") setPrefInvoice(val);
        else if (key === "payment") setPrefPayment(val);
        else if (key === "new_collection") setPrefNewCollection(val);
        else if (key === "birthday") setPrefBirthday(val);
        else if (key === "order_status") setPrefOrderStatus(val);
        toast.success("Preference updated successfully.");
      } else {
        throw new Error();
      }
    } catch (e) {
      toast.error("Failed to update preferences.");
    }
  }

  function savePref(key: string, value: boolean) {
    localStorage.setItem(key, String(value));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!ownerName.trim() || !shopName.trim()) {
      toast.error("Owner name and shop name are required.");
      return;
    }
    setSaving(true);
    try {
      await saveOwnerProfile({
        ownerName: ownerName.trim(),
        shopName: shopName.trim(),
        gstin: gstin.trim() || undefined,
        city: city.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
      });
      refreshProfile(); // update the header profile display
      toast.success("Settings saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch("/api/reset", {
        method: "DELETE",
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Reset failed");
      toast.success("Workspace cleared! All customers, bills, expenses and gold rates removed.");
    } catch (err: any) {
      toast.error(err.message || "Failed to reset workspace.");
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Account" title="Settings" description="Manage your boutique profile, billing details and AI preferences." />
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your profile…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Manage your boutique profile, billing details and AI preferences."
      />

      <form onSubmit={handleSave}>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Business Details */}
          <Card className="luxe-card rounded-3xl border-border/60 p-6">
            <div className="flex items-center gap-2 mb-1">
              <Store className="h-5 w-5 text-[var(--gold)]" />
              <h3 className="font-serif text-xl">Business Details</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              This information appears on your invoices and dashboard.
            </p>
            <div className="grid gap-4">
              <Field label="Owner Name *" value={ownerName} onChange={setOwnerName} placeholder="e.g. Arun Kumar" />
              <Field label="Shop Name *" value={shopName} onChange={setShopName} placeholder="e.g. Sri Lakshmi Jewellers" />
              <Field label="GSTIN" value={gstin} onChange={setGstin} placeholder="e.g. 33ABCDE1234F1Z5" />
              <Field label="Shop Address" value={address} onChange={setAddress} placeholder="e.g. 12, Anna Salai, Chennai" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="City" value={city} onChange={setCity} placeholder="e.g. Chennai" />
                <Field label="Phone" value={phone} onChange={setPhone} placeholder="e.g. +91 98400 12345" />
              </div>
            </div>
            <Button
              type="submit"
              disabled={saving}
              className="mt-6 rounded-2xl bg-[var(--gold)] text-navy hover:opacity-90 w-full"
            >
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Save Changes"}
            </Button>
          </Card>

          {/* Preferences */}
          <Card className="luxe-card rounded-3xl border-border/60 p-6">
            <div className="flex items-center gap-2 mb-1">
              <Bell className="h-5 w-5 text-[var(--gold)]" />
              <h3 className="font-serif text-xl">Preferences</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              Control notifications and automation features.
            </p>
            <div className="space-y-3">
              <Toggle
                label="Daily gold rate alerts"
                description="Get notified when gold prices change significantly"
                checked={goldAlerts}
                onCheckedChange={v => { setGoldAlerts(v); savePref("pref_goldAlerts", v); }}
              />
              <Toggle
                label="AI weekly business briefing"
                description="Receive a Sunday summary of your shop's performance"
                checked={weeklyBriefing}
                onCheckedChange={v => { setWeeklyBriefing(v); savePref("pref_weeklyBriefing", v); }}
              />
            </div>
            <div className="mt-5 rounded-2xl bg-secondary/40 p-4 text-xs text-muted-foreground flex items-start gap-2">
              <Zap className="h-4 w-4 text-[var(--gold)] flex-shrink-0 mt-0.5" />
              <span>Notification preferences are saved locally per device. WhatsApp and email delivery require the integrations to be configured.</span>
            </div>
          </Card>

          {/* WhatsApp Business Integration */}
          <Card className="luxe-card rounded-3xl border-border/60 p-6 md:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-[var(--gold)]" />
                <h3 className="font-serif text-xl">WhatsApp Business Integration</h3>
              </div>
              <div className="flex items-center gap-2">
                {whatsappStatus === "connected" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-600"></span> Connected
                  </span>
                )}
                {whatsappStatus === "invalid_token" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span> Invalid Token
                  </span>
                )}
                {whatsappStatus === "not_connected" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-600"></span> Not Connected
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-6">
              Connect your Meta WhatsApp Business account to send promotional messages, invoices, reminders, and customer notifications.
            </p>
            
            <div className="grid gap-6 md:grid-cols-2">
              {/* Credentials Fields */}
              <div className="grid gap-4">
                <Field label="Phone Number ID" value={phoneNumberId} onChange={setPhoneNumberId} placeholder="e.g. 1058958b8904b74" />
                <Field label="WhatsApp Business Account ID" value={businessAccountId} onChange={setBusinessAccountId} placeholder="e.g. 20985958b8904b" />
                <Field label="Permanent Access Token" value={accessToken} onChange={setAccessToken} placeholder="EAAG..." />
                <Field label="Verify Token" value={verifyToken} onChange={setVerifyToken} placeholder="e.g. my_secret_verify_token" />
                <div className="grid gap-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Webhook URL (Read Only)</Label>
                  <Input value={webhookUrl} readOnly className="bg-secondary/40 font-mono text-xs rounded-xl" onClick={(e) => (e.target as HTMLInputElement).select()} />
                </div>
              </div>
              
              {/* Automation Toggles */}
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground block mb-2 font-medium">Automation Preferences</Label>
                <Toggle
                  label="Festival Campaigns"
                  description="Auto-send festive greeting broadcasts to active segment groups"
                  checked={prefFestival}
                  onCheckedChange={v => updateWhatsAppPref("festival", v)}
                />
                <Toggle
                  label="Invoice Notifications"
                  description="Deliver digital PDF invoices instantly upon billing creation"
                  checked={prefInvoice}
                  onCheckedChange={v => updateWhatsAppPref("invoice", v)}
                />
                <Toggle
                  label="Payment Reminders"
                  description="Send reminders to customers with pending balance amounts"
                  checked={prefPayment}
                  onCheckedChange={v => updateWhatsAppPref("payment", v)}
                />
                <Toggle
                  label="New Collection Announcements"
                  description="Send announcements when new gold products are added"
                  checked={prefNewCollection}
                  onCheckedChange={v => updateWhatsAppPref("new_collection", v)}
                />
                <Toggle
                  label="Birthday Wishes"
                  description="Auto-greet registered customers on their birthdays"
                  checked={prefBirthday}
                  onCheckedChange={v => updateWhatsAppPref("birthday", v)}
                />
                <Toggle
                  label="Order Status Updates"
                  description="Auto-notify on billing verification and delivery status"
                  checked={prefOrderStatus}
                  onCheckedChange={v => updateWhatsAppPref("order_status", v)}
                />
              </div>
            </div>
            
            {/* Buttons Row */}
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                type="button"
                disabled={connectingWhatsApp || loadingWhatsApp}
                onClick={handleConnectWhatsApp}
                className="rounded-2xl bg-[var(--gold)] text-navy hover:opacity-90 min-w-[150px]"
              >
                {connectingWhatsApp ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Connecting…</> : "Connect WhatsApp"}
              </Button>
              
              <Button
                type="button"
                disabled={testingWhatsApp || loadingWhatsApp}
                onClick={handleTestConnection}
                variant="outline"
                className="rounded-2xl border-border bg-background hover:bg-secondary/60 text-foreground min-w-[150px]"
              >
                {testingWhatsApp ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Testing…</> : "Test Connection"}
              </Button>
              
              {whatsappStatus === "connected" && (
                <Button
                  type="button"
                  disabled={disconnectingWhatsApp || loadingWhatsApp}
                  onClick={handleDisconnectWhatsApp}
                  variant="outline"
                  className="rounded-2xl border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-600 min-w-[150px] sm:ml-auto"
                >
                  {disconnectingWhatsApp ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Disconnecting…</> : "Disconnect"}
                </Button>
              )}
            </div>
          </Card>
        </div>
      </form>

      {/* Danger Zone */}
      <Card className="luxe-card rounded-3xl border border-rose-200 dark:border-rose-900/50 p-6">
        <div className="flex items-center gap-2 text-rose-600">
          <AlertTriangle className="h-5 w-5" />
          <h3 className="font-serif text-xl">Danger Zone</h3>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Permanently delete all your customers, bills, expenses, and gold rates. This action <strong>cannot be undone</strong> and your workspace will be completely fresh.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="mt-4 rounded-2xl border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900 dark:hover:bg-rose-950"
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Reset Workspace
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-serif text-2xl">Reset Workspace?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete <strong>all customers, bills, expenses, and gold rates</strong> for your account.
                Your login and profile settings will remain. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleReset}
                disabled={resetting}
                className="rounded-2xl bg-rose-600 text-white hover:bg-rose-700"
              >
                {resetting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Resetting…</> : "Yes, Reset Everything"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="rounded-xl" />
    </div>
  );
}

function Toggle({ label, description, checked, onCheckedChange }: {
  label: string; description: string; checked: boolean; onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-secondary/40 px-4 py-3 gap-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="flex-shrink-0" />
    </div>
  );
}
