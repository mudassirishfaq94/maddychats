import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FullScreenLoader } from "./FullScreenLoader";

/**
 * Guards routes that require authentication. While the session is being
 * verified we show a loader; unauthenticated users are redirected to /login.
 */
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullScreenLoader />;
  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

/**
 * Guards auth pages (login/register). Authenticated users are bounced to /app.
 */
export function PublicOnlyRoute() {
  const { status } = useAuth();

  if (status === "loading") return <FullScreenLoader />;
  if (status === "authenticated") return <Navigate to="/app" replace />;
  return <Outlet />;
}
