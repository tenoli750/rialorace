import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { User as UserIcon, Award } from "lucide-react";

export function Profile() {
  const navigate = useNavigate();
  const { user, points, logout } = useAuth();

  useEffect(() => {
    if (!user) {
      navigate("/login");
    }
  }, [user, navigate]);

  const handleSignOut = async () => {
    await logout();
    navigate("/login.html");
  };

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
      <section className="bg-white rounded-lg border border-[#fed7aa] p-6">
        <div className="mb-6">
          <span className="text-xs text-[#8a5a44] uppercase tracking-wide">Account</span>
          <h1 className="text-2xl text-[#9a3412] mt-1 mb-2">Profile</h1>
          <p className="text-sm text-[#8a5a44]">Your saved account and points balance.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-6 bg-[#fff7ed] rounded-lg border border-[#fed7aa]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-[#9a3412] rounded-full flex items-center justify-center">
                <UserIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-xs text-[#8a5a44]">ID</div>
                <div className="text-xl text-[#9a3412]">{user.username}</div>
              </div>
            </div>
          </div>

          <div className="p-6 bg-[#fff7ed] rounded-lg border border-[#fed7aa]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-[#9a3412] rounded-full flex items-center justify-center">
                <Award className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-xs text-[#8a5a44]">Points</div>
                <div className="text-xl text-[#9a3412]">{points.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="px-6 py-2 bg-[#fff7ed] text-[#9a3412] border border-[#fed7aa] rounded hover:bg-[#ffebee] hover:text-[#c62828] hover:border-[#c62828] transition-colors"
        >
          Sign Out
        </button>
      </section>
    </div>
  );
}
