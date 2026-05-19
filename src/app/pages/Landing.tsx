import { ArrowRight, Bell, CirclePlay, Download, Radio, Trophy, Users } from "lucide-react";
import { Link } from "react-router";

const featuredMarkets = [
  { title: "Market 01", label: "ETH, SOL, TRX, BNB", href: "/market.html?id=market-01", date: "Live now" },
  { title: "Market 02", label: "ETH, XRP, ADA, LTC", href: "/market.html?id=market-02", date: "Next gate" },
];

const teamCards = [
  { name: "Live Feed", role: "Price movement engine", image: "/assets/icons/Wolf.png" },
  { name: "Race Track", role: "Realtime visual race", image: "/assets/icons/Horse.png" },
  { name: "Bet Slip", role: "First, second, third picks", image: "/assets/icons/Bull.png" },
  { name: "Replay Room", role: "Finished race review", image: "/assets/icons/Stag.png" },
];

export function Landing() {
  return (
    <main className="min-h-screen bg-[#f5efe4] text-[#171310]">
      <div className="bg-[#16110d] text-[#f9f2e8]">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/main-menu.html" className="inline-flex items-center gap-2 rounded-full bg-[#e85d24] px-4 py-2 text-white">
              Enter the app <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link to="/market.html?id=market-01" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-[#f9f2e8]">
              <CirclePlay className="h-3.5 w-3.5" /> Watch live
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[#d8c5b2]">
            <span className="inline-flex items-center gap-2"><Download className="h-3.5 w-3.5" /> iOS app soon</span>
            <span className="inline-flex items-center gap-2"><Download className="h-3.5 w-3.5" /> Android app soon</span>
          </div>
        </div>
      </div>

      <header className="relative z-20 bg-[#f5efe4]/95">
        <div className="mx-auto flex max-w-[1480px] flex-col items-center gap-5 px-4 py-7 sm:px-7 lg:grid lg:grid-cols-[1fr_auto_1fr]">
          <nav className="flex flex-wrap justify-center gap-5 text-sm font-semibold uppercase tracking-[0.16em] text-[#6a3a23] lg:justify-start">
            <a href="#about" className="hover:text-[#e85d24]">About</a>
            <a href="#markets" className="hover:text-[#e85d24]">Markets</a>
            <a href="#play" className="hover:text-[#e85d24]">Play</a>
          </nav>
          <Link to="/landing.html" className="flex items-center justify-center" aria-label="Rialo Race landing">
            <img
              src="/assets/create_a_logo_in_this_exact_layout_style_use_the_u_019d8db9-c7d9-75dc-ad2e-f5463423c3be-removebg-preview.png"
              alt="Rialo Race"
              className="h-20 w-auto"
            />
          </Link>
          <nav className="flex flex-wrap justify-center gap-5 text-sm font-semibold uppercase tracking-[0.16em] text-[#6a3a23] lg:justify-end">
            <a href="#replay" className="hover:text-[#e85d24]">Replay</a>
            <a href="#updates" className="hover:text-[#e85d24]">Updates</a>
            <a href="#contact" className="hover:text-[#e85d24]">Contact</a>
          </nav>
        </div>
      </header>

      <section id="play" className="relative overflow-hidden bg-[#171310] text-[#fff8ec]">
        <div className="absolute inset-0">
          <img
            src="/assets/icons/horse-side.png"
            alt=""
            className="absolute bottom-[-6%] right-[-10%] h-[72%] w-auto max-w-none object-contain opacity-25 sm:right-[2%] sm:h-[82%]"
          />
          <img
            src="/assets/icons/bull-side.png"
            alt=""
            className="absolute left-[-8%] top-[18%] h-[48%] w-auto max-w-none object-contain opacity-15"
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_62%_44%,rgba(232,93,36,0.22),transparent_34%),linear-gradient(180deg,rgba(23,19,16,0.08),rgba(23,19,16,0.94))]" />
        </div>

        <div className="relative mx-auto grid min-h-[720px] max-w-[1480px] content-end px-4 pb-10 pt-20 sm:px-7 lg:min-h-[790px] lg:pb-16">
          <div className="max-w-[980px]">
            <p className="mb-5 text-sm font-bold uppercase tracking-[0.34em] text-[#f08a4b]">Rialo Race</p>
            <h1 className="text-[4.5rem] font-black uppercase leading-[0.78] tracking-normal text-[#fff8ec] sm:text-[7.5rem] lg:text-[10.6rem]">
              Your home
              <br />
              for speed
            </h1>
            <p className="mt-7 max-w-[680px] text-xl font-semibold uppercase tracking-[0.12em] text-[#f3d5bd]">
              Live crypto racing, market picks, and replayable results
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:max-w-[650px]">
            <Link
              to="/main-menu.html"
              className="group rounded-md bg-[#e85d24] p-5 text-white transition-transform hover:-translate-y-1"
            >
              <span className="mb-8 flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#e85d24]">
                <Radio className="h-5 w-5" />
              </span>
              <span className="block text-xs font-bold uppercase tracking-[0.24em] text-white/75">Get in the race</span>
              <span className="mt-2 flex items-center justify-between text-2xl font-black uppercase">
                Live markets <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
            <Link
              to="/replay-menu.html"
              className="group rounded-md bg-[#fff8ec] p-5 text-[#171310] transition-transform hover:-translate-y-1"
            >
              <span className="mb-8 flex h-11 w-11 items-center justify-center rounded-full bg-[#171310] text-white">
                <Trophy className="h-5 w-5" />
              </span>
              <span className="block text-xs font-bold uppercase tracking-[0.24em] text-[#8b634a]">Get ready</span>
              <span className="mt-2 flex items-center justify-between text-2xl font-black uppercase">
                Race replay <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      <section id="markets" className="bg-[#f5efe4]">
        <div className="mx-auto grid max-w-[1480px] gap-8 px-4 py-16 sm:px-7 lg:grid-cols-[0.82fr_1.18fr] lg:py-24">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.26em] text-[#e85d24]">Featured Rialo</p>
            <h2 className="mt-3 text-5xl font-black uppercase leading-none text-[#171310] sm:text-7xl">
              Upcoming race
            </h2>
            <Link
              to="/main-menu.html"
              className="mt-7 inline-flex items-center gap-2 rounded-full border border-[#171310]/20 px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-[#171310] hover:border-[#e85d24] hover:text-[#e85d24]"
            >
              View all markets <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-5">
            {featuredMarkets.map((market) => (
              <Link
                key={market.title}
                to={market.href}
                className="group grid gap-5 overflow-hidden rounded-md border border-[#d8c4af] bg-white p-5 text-[#171310] transition-transform hover:-translate-y-1 sm:grid-cols-[1fr_190px]"
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-[#e85d24]">{market.date}</p>
                  <h3 className="mt-4 text-4xl font-black uppercase leading-none">{market.title}</h3>
                  <p className="mt-3 text-base font-semibold text-[#765643]">{market.label}</p>
                  <span className="mt-8 inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-[#e85d24]">
                    View details <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
                <div className="relative min-h-[170px] overflow-hidden rounded-md bg-[#171310]">
                  <img
                    src="/assets/icons/horse-side.png"
                    alt=""
                    className="absolute bottom-2 right-[-18px] h-[86%] w-auto object-contain opacity-80"
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="bg-[#fff8ec]">
        <div className="mx-auto grid max-w-[1480px] gap-10 px-4 py-16 sm:px-7 lg:grid-cols-[0.9fr_1.1fr] lg:py-24">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.26em] text-[#e85d24]">Who we are</p>
            <h2 className="mt-4 max-w-[660px] text-5xl font-black uppercase leading-none text-[#171310] sm:text-7xl">
              A modern platform for live market racing
            </h2>
          </div>
          <div className="grid content-start gap-6">
            <p className="text-xl leading-8 text-[#553d31]">
              Rialo Race turns live coin movement into a track where speed, timing, and prediction meet in one readable event.
            </p>
            <p className="text-xl leading-8 text-[#553d31]">
              Players can pick the podium, follow the race, and replay finished markets with the same visual language across every screen.
            </p>
            <div className="relative mt-4 min-h-[330px] overflow-hidden rounded-md bg-[#171310]">
              <iframe
                title="Rialo Race live market preview"
                src="/legacy-race/market.html?id=market-01&embed=viewport"
                className="absolute inset-0 h-full w-full scale-110 border-0 opacity-65"
              />
              <div className="absolute inset-0 bg-[#171310]/35" />
              <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between gap-4 text-white">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.26em] text-[#f08a4b]">Video</p>
                  <h3 className="mt-1 text-2xl font-black uppercase">Built for realtime speed</h3>
                </div>
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#e85d24]">
                  <CirclePlay className="h-6 w-6" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="replay" className="bg-[#f5efe4]">
        <div className="mx-auto max-w-[1480px] px-4 py-16 sm:px-7 lg:py-24">
          <div className="grid gap-7 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.26em] text-[#e85d24]">Decades of motion</p>
              <h2 className="mt-3 text-5xl font-black uppercase leading-none text-[#171310] sm:text-7xl">
                The Rialo track
              </h2>
            </div>
            <p className="max-w-[720px] text-xl leading-8 text-[#553d31]">
              Every part of the app is built around a fast loop: choose a market, read the racers, place your prediction, then review the finish.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {teamCards.map((card) => (
              <article key={card.name} className="overflow-hidden rounded-md bg-white">
                <div className="flex h-[260px] items-center justify-center bg-[#171310] p-8">
                  <img src={card.image} alt="" className="max-h-full max-w-full object-contain" />
                </div>
                <div className="p-5">
                  <h3 className="text-2xl font-black uppercase text-[#171310]">{card.name}</h3>
                  <p className="mt-2 text-sm font-semibold uppercase tracking-[0.14em] text-[#8b634a]">{card.role}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="updates" className="bg-[#171310] text-[#fff8ec]">
        <div className="mx-auto grid max-w-[1480px] gap-10 px-4 py-16 sm:px-7 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.28em] text-[#f08a4b]">We move fast</p>
            <h2 className="mt-3 text-5xl font-black uppercase leading-none sm:text-7xl">
              Be first to know
            </h2>
          </div>
          <form className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="sr-only" htmlFor="landingEmail">Email</label>
            <input
              id="landingEmail"
              type="email"
              placeholder="Email address"
              className="min-h-14 rounded-md border border-white/20 bg-white/10 px-4 text-base text-white outline-none placeholder:text-white/55 focus:border-[#f08a4b]"
            />
            <button
              type="button"
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-md bg-[#e85d24] px-7 text-sm font-black uppercase tracking-[0.16em] text-white"
            >
              Stay on track <Bell className="h-4 w-4" />
            </button>
          </form>
        </div>
      </section>

      <footer id="contact" className="bg-[#0f0b08] text-[#d8c5b2]">
        <div className="mx-auto grid max-w-[1480px] gap-10 px-4 py-12 sm:px-7 md:grid-cols-[1.2fr_0.8fr_0.8fr]">
          <div>
            <img
              src="/assets/create_a_logo_in_this_exact_layout_style_use_the_u_019d8db9-c7d9-75dc-ad2e-f5463423c3be-removebg-preview.png"
              alt="Rialo Race"
              className="h-16 w-auto brightness-0 invert"
            />
            <p className="mt-5 max-w-[520px] text-sm leading-6">
              Rialo Race is a live crypto racing experience for market watchers, prediction players, and replay-driven competitors.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">Contact</h3>
            <p className="mt-4 text-sm">team@rialorace.com</p>
            <Link to="/login.html" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#f08a4b]">
              Ask a question <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">Social</h3>
            <div className="mt-4 flex gap-3">
              <Link to="/community.html" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white">
                <Users className="h-4 w-4" />
              </Link>
              <Link to="/main-menu.html" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white">
                <Radio className="h-4 w-4" />
              </Link>
              <Link to="/rewards.html" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white">
                <Trophy className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-5 text-center text-xs uppercase tracking-[0.16em] text-[#8b7a6a]">
          © 2026 Rialo Race. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
