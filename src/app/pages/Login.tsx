import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../contexts/AuthContext";

export function Login() {
  const navigate = useNavigate();
  const { user, login, signup } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      navigate("/profile.html");
    }
  }, [user, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (username.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      await login(username, password);
      navigate("/profile.html");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    }
  };

  const handleSignUp = async () => {
    setError("");

    if (username.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      await signup(username, password);
      navigate("/profile.html");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed. Please try again.");
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
      <div className="max-w-md mx-auto">
        <section className="bg-white rounded-lg border border-[#fed7aa] p-6">
          <div className="mb-6">
            <span className="text-xs text-[#8a5a44] uppercase tracking-wide">Account</span>
            <h1 className="text-2xl text-[#9a3412] mt-1 mb-2">Account</h1>
            <p className="text-sm text-[#8a5a44]">
              Create an account or sign in with ID and password. If you are already signed in,
              this page will redirect to your profile.
            </p>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-sm text-[#9a3412] mb-2">ID</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your-id"
                minLength={3}
                required
                className="w-full px-3 py-2 bg-[#fff7ed] border border-[#fed7aa] rounded text-[#9a3412] focus:outline-none focus:border-[#9a3412]"
              />
            </div>

            <div>
              <label className="block text-sm text-[#9a3412] mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                minLength={6}
                required
                className="w-full px-3 py-2 bg-[#fff7ed] border border-[#fed7aa] rounded text-[#9a3412] focus:outline-none focus:border-[#9a3412]"
              />
            </div>

            {error && (
              <div className="p-3 bg-[#ffebee] border border-[#c62828] rounded text-sm text-[#c62828]">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 px-6 py-2 bg-[#9a3412] text-white rounded hover:bg-[#c2410c] transition-colors"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={handleSignUp}
                className="flex-1 px-6 py-2 bg-[#fff7ed] text-[#9a3412] border border-[#fed7aa] rounded hover:bg-[#ffedd5] transition-colors"
              >
                Sign Up
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
