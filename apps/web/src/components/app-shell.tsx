import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, ScrollText, Truck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Дашборд", icon: LayoutDashboard, end: true },
  { to: "/suppliers", label: "Поставщики", icon: Truck, end: false },
  { to: "/journal", label: "Журнал", icon: ScrollText, end: false },
];

export function AppShell() {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-3 sm:w-48 sm:items-stretch sm:px-2">
        <div className="mb-3 flex items-center gap-2 px-2 text-sm font-semibold text-foreground">
          <Zap className="h-4 w-4 text-primary shrink-0" />
          <span className="hidden sm:inline">Модельная электрика</span>
        </div>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                isActive && "bg-accent text-accent-foreground",
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{item.label}</span>
          </NavLink>
        ))}
      </aside>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
