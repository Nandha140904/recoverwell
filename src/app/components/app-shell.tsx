import { Outlet } from "react-router";
import { RecoveryProvider } from "./store";

export function AppShell() {
  return (
    <RecoveryProvider>
      <Outlet />
    </RecoveryProvider>
  );
}
