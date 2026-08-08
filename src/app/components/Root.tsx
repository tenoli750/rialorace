import { Outlet } from "react-router";
import { Header } from "./Header";

/** All app pages share Home-style landing chrome (header + dark shell). */
export function Root() {
  return (
    <div className="rialo-landing rialo-app">
      <Header />
      <Outlet />
    </div>
  );
}
