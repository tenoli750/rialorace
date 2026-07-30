import { Outlet } from "react-router";
import { AuthProvider } from "../contexts/AuthContext";
import { GlobalAssistant } from "./GlobalAssistant";

/** Wraps every route: auth + floating assistant. */
export function AppLayout() {
  return (
    <AuthProvider>
      <Outlet />
      <GlobalAssistant />
    </AuthProvider>
  );
}
