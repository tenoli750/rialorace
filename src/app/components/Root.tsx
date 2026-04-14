import { Outlet } from "react-router";
import { Header } from "./Header";
import { AuthProvider } from "../contexts/AuthContext";

export function Root() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-[#fff7ed]">
        <Header />
        <Outlet />
      </div>
    </AuthProvider>
  );
}
