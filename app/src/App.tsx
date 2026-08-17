import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { AdminRoute, ProtectedRoute } from "./auth";
import AppShell from "./components/AppShell";

const Account = lazy(() => import("./pages/Account"));
const Admin = lazy(() => import("./pages/Admin"));
const AuthPage = lazy(() => import("./pages/Auth"));
const Billing = lazy(() => import("./pages/Billing"));
const CreateProduction = lazy(() => import("./pages/Create"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const JobPage = lazy(() => import("./pages/Job"));
const Landing = lazy(() => import("./pages/Landing"));
const Library = lazy(() => import("./pages/Library"));
const VerifyEmailPage = lazy(() =>
  import("./pages/TokenPages").then((module) => ({ default: module.VerifyEmailPage })),
);
const ResetPasswordPage = lazy(() =>
  import("./pages/TokenPages").then((module) => ({ default: module.ResetPasswordPage })),
);

function RouteLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#08090c] text-zinc-400">
      <div className="flex items-center gap-3 text-sm">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" />
        Loading secure workspace…
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/studio" element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="create" element={<CreateProduction />} />
              <Route path="jobs/:id" element={<JobPage />} />
              <Route path="library" element={<Library />} />
              <Route path="billing" element={<Billing />} />
              <Route path="account" element={<Account />} />
            </Route>
          </Route>

          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AppShell />}>
              <Route index element={<Admin />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster
        position="top-right"
        theme="dark"
        richColors
        toastOptions={{
          style: {
            background: "#15171d",
            border: "1px solid rgba(255,255,255,.1)",
            color: "#f4f4f5",
          },
        }}
      />
    </>
  );
}
