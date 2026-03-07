import { createBrowserRouter } from "react-router";
import { AppShell } from "./components/app-shell";
import { Layout } from "./components/layout";
import { Dashboard } from "./components/dashboard";
import { Documents } from "./components/documents";
import { HealthLog } from "./components/health-log";
import { RecoveryGuide } from "./components/recovery-guide";
import { Progress } from "./components/progress";
import { SignIn } from "./components/sign-in";
import { OnboardingUpload } from "./components/onboarding-upload";
import { Medications } from "./components/medications";
import { AuthGuard, GuestGuard, OnboardingGuard } from "./components/auth-guard";

export const router = createBrowserRouter([
  {
    Component: AppShell,
    children: [
      // Guest routes (sign-in)
      {
        Component: GuestGuard,
        children: [
          { path: "sign-in", Component: SignIn },
        ],
      },
      // Onboarding route (logged in but no discharge uploaded)
      {
        Component: OnboardingGuard,
        children: [
          { path: "onboarding-upload", Component: OnboardingUpload },
        ],
      },
      // Protected routes (logged in + discharge uploaded)
      {
        Component: AuthGuard,
        children: [
          {
            path: "/",
            Component: Layout,
            children: [
              { index: true, Component: Dashboard },
              { path: "documents", Component: Documents },
              { path: "health-log", Component: HealthLog },
              { path: "medications", Component: Medications },
              { path: "recovery", Component: RecoveryGuide },
              { path: "progress", Component: Progress },
            ],
          },
        ],
      },
    ],
  },
]);
