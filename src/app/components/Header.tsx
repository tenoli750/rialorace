import { Link, useLocation } from "react-router";
import { useAuth } from "../contexts/AuthContext";

export function Header() {
  const location = useLocation();
  const { user, points } = useAuth();

  const isActive = (path: string) => {
    if (path === "/" && location.pathname === "/") return true;
    if (path !== "/" && location.pathname.startsWith(path)) return true;
    return false;
  };

  const navItems = [
    { path: "/main-menu.html", label: "Live Markets" },
    { path: "/replay-menu.html", label: "Replay" },
    { path: "/community.html", label: "Rankings" },
    { path: "/rewards.html", label: "Rewards" },
    { path: "/my-bets.html", label: "History" },
  ];

  return (
    <header className="bg-white border-b border-[#fed7aa]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4">
        <Link to="/main-menu.html" className="inline-flex items-center mb-4" aria-label="Rialo Race">
          <img
            src="/assets/create_a_logo_in_this_exact_layout_style_use_the_u_019d8db9-c7d9-75dc-ad2e-f5463423c3be-removebg-preview.png"
            alt="Rialo Race"
            className="h-16 w-auto"
          />
        </Link>

        <nav className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${
                isActive(item.path)
                  ? "bg-[#9a3412] text-white"
                  : "text-[#9a3412] hover:bg-[#ffedd5]"
              }`}
            >
              {item.label}
            </Link>
          ))}

          <div className="flex-1" />

          <span className="px-3 py-2 text-sm text-[#9a3412]">
            {user ? `Points: ${points.toLocaleString()}` : "Points --"}
          </span>

          <Link
            to={user ? "/profile.html" : "/login.html"}
            className={`px-4 py-2 rounded-md text-sm transition-colors ${
              isActive(user ? "/profile.html" : "/login.html")
                ? "bg-[#9a3412] text-white"
                : "text-[#9a3412] hover:bg-[#ffedd5]"
            }`}
          >
            {user ? "Profile" : "Login"}
          </Link>
        </nav>
      </div>
    </header>
  );
}
