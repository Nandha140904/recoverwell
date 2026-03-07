import { Navigate, Outlet } from "react-router";
import { useRecovery } from "./store";

export function AuthGuard() {
  const { data } = useRecovery();

  if (!data.userProfile?.isLoggedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  if (!data.userProfile?.hasUploadedDischarge) {
    return <Navigate to="/onboarding-upload" replace />;
  }

  return <Outlet />;
}

export function GuestGuard() {
  const { data } = useRecovery();

  if (data.userProfile?.isLoggedIn && data.userProfile?.hasUploadedDischarge) {
    return <Navigate to="/" replace />;
  }

  if (data.userProfile?.isLoggedIn && !data.userProfile?.hasUploadedDischarge) {
    return <Navigate to="/onboarding-upload" replace />;
  }

  return <Outlet />;
}

export function OnboardingGuard() {
  const { data } = useRecovery();

  if (!data.userProfile?.isLoggedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  if (data.userProfile?.hasUploadedDischarge) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
