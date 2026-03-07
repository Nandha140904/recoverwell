import { NavLink, Outlet, useNavigate } from "react-router";
import {
  LayoutDashboard,
  FileText,
  Activity,
  Heart,
  TrendingUp,
  Menu,
  X,
  HeartPulse,
  LogOut,
  PhoneCall,
  Pill,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useRecovery } from "./store";
import { scheduleMedicationNotifications } from "./notifications";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/dashboard/documents", icon: FileText, label: "Documents" },
  { to: "/dashboard/health-log", icon: Activity, label: "Health Log" },
  { to: "/dashboard/medications", icon: Pill, label: "Medications" },
  { to: "/dashboard/recovery", icon: Heart, label: "Recovery Guide" },
  { to: "/dashboard/progress", icon: TrendingUp, label: "Progress" },
];

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data, logout } = useRecovery();
  const navigate = useNavigate();

  useEffect(() => {
    if (data.medications?.length > 0) {
      scheduleMedicationNotifications(data.medications);
    }
  }, [data.medications]);

  const user = data.userProfile;
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  const handleLogout = () => {
    logout();
    navigate("/sign-in");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-card">
        <div className="flex items-center gap-2.5 px-6 py-5 border-b border-border">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <HeartPulse className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-[15px] tracking-tight">RecoverWell</h1>
            <p className="text-[11px] text-muted-foreground">Recovery Assistant</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/dashboard"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`
              }
            >
              <item.icon className="w-[18px] h-[18px]" />
              <span className="text-[14px]">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User Section + SOS */}
        <div className="px-3 py-3 border-t border-border space-y-2">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-[11px] text-primary">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-foreground truncate">{user?.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {user?.bloodGroup} • Dr. {user?.doctorName}
              </p>
            </div>
          </div>

          {/* SOS Emergency Button */}
          {user?.doctorMobile && (
            <a
              href={`tel:${user.doctorMobile}`}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors animate-pulse"
              title={`Emergency call Dr. ${user.doctorName}`}
            >
              <PhoneCall className="w-4 h-4" />
              🚨 SOS — Call Doctor
            </a>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-[13px]">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <HeartPulse className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-[15px]">RecoverWell</span>
        </div>
        <div className="flex items-center gap-2">
          {/* SOS button in mobile header */}
          {user?.doctorMobile && (
            <a
              href={`tel:${user.doctorMobile}`}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500 text-white rounded-lg text-[12px] font-semibold hover:bg-red-600 transition-colors animate-pulse"
              title="SOS Emergency Call"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              SOS
            </a>
          )}
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-[10px] text-primary">{initials}</span>
          </div>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-lg hover:bg-muted"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)}>
          <div
            className="absolute left-0 top-0 bottom-0 w-64 bg-card pt-16 px-3 py-4 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* User info */}
            <div className="flex items-center gap-2.5 px-2 pb-4 border-b border-border mb-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-[12px] text-primary">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-foreground truncate">{user?.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {user?.bloodGroup} • Dr. {user?.doctorName}
                </p>
              </div>
            </div>

            <nav className="space-y-1 flex-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/dashboard"}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`
                  }
                >
                  <item.icon className="w-[18px] h-[18px]" />
                  <span className="text-[14px]">{item.label}</span>
                </NavLink>
              ))}
            </nav>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors mt-3 border-t border-border pt-3"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-[13px]">Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto lg:pt-0 pt-14">
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
