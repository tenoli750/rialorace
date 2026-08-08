import { Link, useLocation } from "react-router";
import { CircleUserRound, Crosshair } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const NAV_ITEMS: Array<[string, string]> = [
  ["HOME", "/home"],
  ["LIVE MARKETS", "/live-markets.html"],
  ["REPLAY", "/replay-menu.html"],
  ["LOTTO", "/race-lotto"],
  ["SLOT", "/slot"],
  ["SHOP", "/shop"],
  ["RANKINGS", "/community.html"],
  ["REWARDS", "/rewards.html"],
  ["HISTORY", "/my-bets.html"],
];

export function Header() {
  const location = useLocation();
  const { user, points } = useAuth();

  const isActive = (path: string) => {
    if (path === "/home") {
      return location.pathname === "/home" || location.pathname === "/home.html";
    }
    if (path === "/slot") {
      return (
        location.pathname.startsWith("/slot") ||
        location.pathname.startsWith("/rwa-slot") ||
        location.pathname.startsWith("/paxg-slot")
      );
    }
    if (path === "/race-lotto") {
      return location.pathname.startsWith("/race-lotto") || location.pathname.startsWith("/lotto");
    }
    if (path === "/live-markets.html") {
      return location.pathname.startsWith("/live-markets");
    }
    if (path === "/replay-menu.html") {
      return location.pathname.startsWith("/replay-menu") || location.pathname.startsWith("/replay");
    }
    if (path === "/community.html") {
      return location.pathname.startsWith("/community") || location.pathname.startsWith("/rankings");
    }
    if (path === "/rewards.html") {
      return location.pathname.startsWith("/rewards");
    }
    if (path === "/my-bets.html") {
      return location.pathname.startsWith("/my-bets") || location.pathname.startsWith("/history");
    }
    if (path === "/shop") {
      return location.pathname.startsWith("/shop");
    }
    return location.pathname === path || location.pathname === `${path}.html`;
  };

  return (
    <header className="landing-header">
      <Link to="/home" className="brand" aria-label="Rialo Race home">
        <strong>RIALO RACE</strong>
      </Link>

      <nav aria-label="Primary navigation">
        <Link className={`nav-home${isActive("/home") ? " active" : ""}`} to="/home">
          HOME
        </Link>
        <div className="nav-scroll">
          {NAV_ITEMS.filter(([, path]) => path !== "/home").map(([label, path]) => (
            <Link key={path} to={path} className={isActive(path) ? "active" : undefined}>
              {label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="account-actions">
        <Link className="points" to="/points.html">
          POINTS: <b>{user ? points.toLocaleString() : "--"}</b>
          <Crosshair size={16} />
        </Link>
        <Link className="profile" to={user ? "/profile.html" : "/login.html"}>
          <CircleUserRound size={18} />
          {user ? "PROFILE" : "LOGIN"}
        </Link>
      </div>
    </header>
  );
}
