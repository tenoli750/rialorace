import { Outlet } from "react-router";
import { Header } from "./Header";

export function Root() {
  return (
    <div className="min-h-screen bg-[#fff7ed]">
      <Header />
      <Outlet />
    </div>
  );
}
