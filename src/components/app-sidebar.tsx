import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Receipt, LineChart, Boxes, Coins, Wallet,
  MessageCircle, Sparkles, Settings, Store, BookOpen,
  PiggyBank, CalendarDays, Newspaper, Brain,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";

// Primary navigation items (spec-mandated)
const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Billing", url: "/billing", icon: Receipt },
  { title: "Sales Analytics", url: "/sales", icon: LineChart },
  { title: "Inventory", url: "/inventory", icon: Boxes },
  { title: "Demand Prediction", url: "/demand-prediction", icon: Brain },
  { title: "Gold Rates", url: "/gold-rates", icon: Coins },
  { title: "WhatsApp Automation", url: "/whatsapp", icon: MessageCircle },
  { title: "WhatsApp Setup", url: "/whatsapp-integration", icon: Settings },
  { title: "Settings", url: "/settings", icon: Settings },
];

// Future modules (hidden, available in codebase)
// { title: "Savings Planner", url: "/savings", icon: PiggyBank },
// { title: "Events", url: "/events", icon: CalendarDays },

// Renamed: Industry Insights → Blogs
const futureItems = [
  { title: "Blogs", url: "/insights", icon: BookOpen },
];

export function AppSidebar({ shopName }: { shopName: string }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-4 py-5">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl gold-gradient text-navy shadow-md">
            <Sparkles className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-serif text-lg font-semibold text-sidebar-foreground">JewelMind</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--gold)]">AI · ERP · CRM</div>
            </div>
          )}
        </Link>
        {!collapsed && shopName && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2">
            <Store className="h-3.5 w-3.5 text-[var(--gold)] flex-shrink-0" />
            <span className="text-xs font-medium text-foreground truncate">{shopName}</span>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[var(--gold)]/70">Workspace</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = item.url === "/" ? pathname === "/" : pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.url} className="flex items-center gap-3">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
