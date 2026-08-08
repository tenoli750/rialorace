import { Outlet } from "react-router";
import { GlobalAssistant } from "./GlobalAssistant";

/** Root route shell: page outlet + floating assistant (must stay under RouterProvider). */
export function AppLayout() {
  return (
    <>
      <Outlet />
      <GlobalAssistant />
    </>
  );
}
