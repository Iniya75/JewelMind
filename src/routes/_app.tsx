import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { LogOut } from "lucide-react";
import { OwnerProfileProvider, useOwnerProfile } from "@/hooks/use-owner-profile";
import { FloatingAIAssistant } from "@/components/ai/FloatingAIAssistant";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export const Route = createFileRoute("/_app")({
  component: AppLayoutWrapper,
});

function initials(s: string) {
  return s
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function AppLayoutWrapper() {
  return (
    <OwnerProfileProvider>
      <AppLayout />
    </OwnerProfileProvider>
  );
}

function AppLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const { ownerName, shopName, email, profileLoaded } = useOwnerProfile();

  useEffect(() => {
    let active = true;
    
    // Check local storage for JWT token
    const token = localStorage.getItem("access_token");
    if (!token) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    
    setReady(true);
    
    return () => { active = false; };
  }, [navigate]);


  async function handleSignOut() {
    localStorage.removeItem("access_token");
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  if (!ready || !profileLoaded) {
    return (
      <div className="grid min-h-screen w-full place-items-center bg-background text-sm text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar shopName={shopName} />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border/60 bg-background/80 px-6 backdrop-blur">
            <SidebarTrigger className="text-foreground" />
            <div className="ml-auto flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-2.5 py-1.5 transition hover:bg-secondary/60">
                    <div className="grid h-7 w-7 place-items-center rounded-lg gold-gradient text-xs font-semibold text-navy">
                      {initials(ownerName)}
                    </div>
                    <div className="hidden text-left leading-tight md:block">
                      <div className="text-sm font-medium">{ownerName}</div>
                      <div className="text-[11px] text-muted-foreground">{email}</div>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-2xl">
                  <DropdownMenuLabel>
                    <div className="font-medium">{ownerName}</div>
                    <div className="text-xs font-normal text-muted-foreground">{email}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-rose-600 focus:text-rose-600">
                    <LogOut className="mr-2 h-4 w-4" /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 px-6 py-8">
            <Outlet />
          </main>
        </div>
      </div>
      <FloatingAIAssistant />
    </SidebarProvider>
  );
}
