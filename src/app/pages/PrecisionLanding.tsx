import {
  ArrowRight,
  Flag,
  Gauge,
  Radio,
  Timer,
  Trophy,
} from "lucide-react";
import { Link } from "react-router";

const controlMetrics = [
  { label: "Latency target", value: "1s", detail: "price feed cadence" },
  { label: "Race format", value: "200m", detail: "single-market sprint" },
  { label: "Active markets", value: "02", detail: "live-ready gates" },
];

const systemCards = [
  {
    title: "Live Feed",
    text: "Market movement is converted into track speed so every position change reads like a physical race.",
    icon: Radio,
  },
  {
    title: "Race Engine",
    text: "Each token keeps a clear lane, visible momentum, and finish distance for fast decision-making.",
    icon: Gauge,
  },
  {
    title: "Podium Slip",
    text: "Players choose first, second, and third with a compact flow designed for quick race entry.",
    icon: Trophy,
  },
  {
    title: "Replay Room",
    text: "Finished markets remain reviewable so winners, timing, and movement can be inspected after the flag.",
    icon: Timer,
  },
];

const indicatorRows = [
  { code: "01", title: "Signal", value: "Realtime candles translated into momentum" },
  { code: "02", title: "Position", value: "Every racer visible against a fixed race state" },
  { code: "03", title: "Slip", value: "Selections stay focused on podium outcome" },
  { code: "04", title: "Archive", value: "Replay creates a clear post-race record" },
];

export function PrecisionLanding() {
  return (
    <main className="min-h-screen bg-[#000000] font-sans text-[#ffffff] tracking-normal">
      <header className="relative z-30 border-b border-[#303030] bg-[#000000]">
        <div className="mx-auto grid max-w-[1480px] gap-5 px-5 py-5 md:grid-cols-[1fr_auto_1fr] md:items-center md:px-8">
          <nav className="flex flex-wrap items-center gap-6 text-[13px] uppercase leading-[1.78] text-[#ffffff] md:justify-start">
            <a className="border-b border-transparent pb-[5px] hover:border-[#FF0000]" href="#system">
              System
            </a>
            <a className="border-b border-transparent pb-[5px] hover:border-[#FF0000]" href="#markets">
              Markets
            </a>
            <a className="border-b border-transparent pb-[5px] hover:border-[#FF0000]" href="#control">
              Control
            </a>
          </nav>

          <Link to="/precision-landing.html" className="text-[13px] uppercase leading-[1.78] text-[#ffffff]">
            Rialo Race
          </Link>

          <nav className="flex flex-wrap items-center gap-6 text-[13px] uppercase leading-[1.78] text-[#8f8f8f] md:justify-end">
            <Link className="border-b border-transparent pb-[5px] text-[#ffffff] hover:border-[#FF0000]" to="/main-menu.html">
              Launch App
            </Link>
            <Link className="border-b border-transparent pb-[5px] hover:border-[#FF0000] hover:text-[#ffffff]" to="/replay-menu.html">
              Replay
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-[#000000]">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:120px_120px]" />
        <img
          src="/assets/icons/horse-side.png"
          alt=""
          className="absolute bottom-[-5%] right-[-38%] h-[74%] max-w-none grayscale contrast-150 brightness-75 sm:right-[-18%] sm:h-[84%] lg:right-[0] lg:h-[92%]"
        />
        <img
          src="/assets/icons/bull-side.png"
          alt=""
          className="absolute left-[-36%] top-[12%] h-[48%] max-w-none grayscale contrast-125 brightness-50 opacity-45 sm:left-[-16%] lg:left-[2%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#000000_0%,rgba(0,0,0,0.82)_38%,rgba(0,0,0,0.34)_78%,#000000_100%)]" />

        <div className="relative mx-auto grid min-h-[86svh] max-w-[1480px] content-end px-5 pb-10 pt-16 md:px-8 lg:pb-16">
          <div className="max-w-[980px]">
            <p className="mb-6 max-w-[620px] border-l border-[#FF0000] pl-5 text-[12px] uppercase leading-[1.78] text-[#8f8f8f]">
              Precision market racing for live crypto movement.
            </p>
            <h1 className="text-[64px] font-medium uppercase leading-[0.9] text-[#ffffff] sm:text-[96px] lg:text-[128px]">
              Rialo
              <br />
              Race
            </h1>
            <p className="mt-7 max-w-[620px] text-[13px] uppercase leading-[2] text-[#ffffff]">
              A focused race surface where every price pulse becomes position, pressure, and finish-line intent.
            </p>
          </div>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Link
              to="/main-menu.html"
              className="group inline-flex min-h-[44px] items-center justify-center gap-3 border border-[#ffffff] bg-transparent px-5 text-[12px] uppercase leading-[1.5] text-[#ffffff] hover:border-[#FF0000]"
            >
              Enter live markets
              <ArrowRight className="h-4 w-4 text-[#FF0000] transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to="/replay-menu.html"
              className="group inline-flex min-h-[44px] items-center justify-center gap-3 border border-[#303030] bg-[#181818] px-5 text-[12px] uppercase leading-[1.5] text-[#ffffff] hover:border-[#FF0000]"
            >
              View race archive
              <ArrowRight className="h-4 w-4 text-[#FF0000] transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="mt-12 grid border-y border-[#303030] md:grid-cols-3">
            {controlMetrics.map((metric) => (
              <div key={metric.label} className="border-[#303030] py-5 md:border-r md:px-6 md:last:border-r-0">
                <p className="text-[11px] uppercase leading-[1.78] text-[#8f8f8f]">{metric.label}</p>
                <p className="mt-1 text-[30px] font-medium uppercase leading-none text-[#ffffff]">{metric.value}</p>
                <p className="mt-2 text-[12px] uppercase leading-[1.78] text-[#8f8f8f]">{metric.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex gap-[6px]" aria-hidden="true">
            <span className="h-[5px] w-[44px] bg-[#FF0000]" />
            <span className="h-[5px] w-[44px] border border-[#8f8f8f]" />
            <span className="h-[5px] w-[44px] border border-[#303030]" />
          </div>
        </div>
      </section>

      <section id="system" className="bg-[#ffffff] text-[#181818]">
        <div className="mx-auto grid max-w-[1480px] gap-12 px-5 py-16 md:px-8 lg:grid-cols-[0.88fr_1.12fr] lg:py-24">
          <div>
            <p className="text-[12px] uppercase leading-[1.78] text-[#FF0000]">Race control surface</p>
            <h2 className="mt-5 max-w-[620px] text-[42px] font-medium uppercase leading-[1.02] text-[#181818] sm:text-[58px]">
              Built like a cockpit for volatile markets.
            </h2>
            <p className="mt-6 max-w-[580px] text-[13px] leading-[2] text-[#303030]">
              The landing system strips the interface down to black, white, steel, and one red indicator. The result is more focused than decorative: clear entry, clear market state, clear replay path.
            </p>
          </div>

          <div className="grid border border-[#303030] bg-[#000000]">
            <div className="relative min-h-[420px] overflow-hidden border-b border-[#303030]">
              <iframe
                title="Rialo Race live market preview"
                src="/legacy-race/market.html?id=market-01&embed=viewport"
                className="absolute inset-0 h-full w-full scale-110 border-0 opacity-75 grayscale"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.76))]" />
              <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-5 p-5">
                <div>
                  <p className="text-[11px] uppercase leading-[1.78] text-[#FF0000]">Market 01</p>
                  <h3 className="mt-1 text-[28px] font-medium uppercase leading-none text-[#ffffff]">Live race viewport</h3>
                </div>
                <Flag className="h-8 w-8 text-[#ffffff]" />
              </div>
            </div>
            <div className="grid gap-px bg-[#303030] sm:grid-cols-3">
              <div className="bg-[#000000] p-5">
                <p className="text-[11px] uppercase leading-[1.78] text-[#8f8f8f]">Mode</p>
                <p className="mt-1 text-[13px] uppercase leading-[1.78] text-[#ffffff]">Realtime</p>
              </div>
              <div className="bg-[#000000] p-5">
                <p className="text-[11px] uppercase leading-[1.78] text-[#8f8f8f]">Racers</p>
                <p className="mt-1 text-[13px] uppercase leading-[1.78] text-[#ffffff]">ETH / SOL / TRX / BNB</p>
              </div>
              <div className="bg-[#000000] p-5">
                <p className="text-[11px] uppercase leading-[1.78] text-[#8f8f8f]">Action</p>
                <Link className="mt-1 inline-flex items-center gap-2 text-[13px] uppercase leading-[1.78] text-[#ffffff]" to="/market.html?id=market-01">
                  Open market <ArrowRight className="h-4 w-4 text-[#FF0000]" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="markets" className="bg-[#000000] text-[#ffffff]">
        <div className="mx-auto max-w-[1480px] px-5 py-16 md:px-8 lg:py-24">
          <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
            <div>
              <p className="text-[12px] uppercase leading-[1.78] text-[#FF0000]">Operating modules</p>
              <h2 className="mt-5 max-w-[620px] text-[42px] font-medium uppercase leading-[1.02] sm:text-[58px]">
                Four systems, one race line.
              </h2>
            </div>
            <p className="max-w-[680px] text-[13px] leading-[2] text-[#8f8f8f]">
              Every section is designed for fast scanning: muted steel surfaces, strict edges, and red only where the player needs to act or orient.
            </p>
          </div>

          <div className="mt-12 grid border border-[#303030] md:grid-cols-2 xl:grid-cols-4">
            {systemCards.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.title} className="min-h-[300px] border-b border-[#303030] bg-[#181818] p-5 md:border-r xl:border-b-0 xl:last:border-r-0">
                  <div className="flex h-12 w-12 items-center justify-center border border-[#303030] text-[#ffffff]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-12 text-[24px] font-medium uppercase leading-[1.1] text-[#ffffff]">{card.title}</h3>
                  <p className="mt-5 text-[12px] leading-[1.78] text-[#8f8f8f]">{card.text}</p>
                  <div className="mt-8 h-[2px] w-[50px] bg-[#FF0000]" />
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="control" className="bg-[#ffffff] text-[#181818]">
        <div className="mx-auto grid max-w-[1480px] gap-10 px-5 py-16 md:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:py-24">
          <div className="relative min-h-[520px] overflow-hidden bg-[#000000]">
            <img
              src="/assets/icons/bull-head-side-v3.png"
              alt=""
              className="absolute bottom-[-3%] right-[-12%] h-[88%] max-w-none grayscale contrast-150 brightness-90 sm:right-[4%]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,#000000_0%,rgba(0,0,0,0.72)_48%,rgba(0,0,0,0.12)_100%)]" />
            <div className="absolute left-0 top-0 h-full w-[6px] bg-[#FF0000]" />
            <div className="absolute bottom-0 left-0 max-w-[520px] p-6">
              <p className="text-[11px] uppercase leading-[1.78] text-[#FF0000]">Indicator discipline</p>
              <h2 className="mt-4 text-[40px] font-medium uppercase leading-[1.04] text-[#ffffff] sm:text-[52px]">
                Red appears only when it matters.
              </h2>
            </div>
          </div>

          <div className="grid content-center">
            <p className="text-[12px] uppercase leading-[1.78] text-[#FF0000]">Decision stack</p>
            <h2 className="mt-5 text-[42px] font-medium uppercase leading-[1.02] sm:text-[58px]">
              A cleaner degen cockpit.
            </h2>
            <p className="mt-6 text-[13px] leading-[2] text-[#303030]">
              The page frames Rialo Race as performance software: live signals, podium intent, and replay confidence without colorful noise.
            </p>

            <div className="mt-10 border-y border-[#303030]">
              {indicatorRows.map((row) => (
                <div key={row.code} className="grid gap-4 border-b border-[#303030] py-5 last:border-b-0 sm:grid-cols-[64px_160px_1fr]">
                  <span className="text-[13px] uppercase leading-[1.78] text-[#FF0000]">{row.code}</span>
                  <span className="text-[13px] uppercase leading-[1.78] text-[#181818]">{row.title}</span>
                  <span className="text-[12px] leading-[1.78] text-[#8f8f8f]">{row.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link
                to="/market.html?id=market-01"
                className="group inline-flex min-h-[44px] items-center justify-center gap-3 border border-[#181818] bg-[#181818] px-5 text-[12px] uppercase leading-[1.5] text-[#ffffff] hover:border-[#FF0000]"
              >
                Open Market 01
                <ArrowRight className="h-4 w-4 text-[#FF0000] transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                to="/main-menu.html"
                className="group inline-flex min-h-[44px] items-center justify-center gap-3 border border-[#303030] bg-[#ffffff] px-5 text-[12px] uppercase leading-[1.5] text-[#181818] hover:border-[#FF0000]"
              >
                All markets
                <ArrowRight className="h-4 w-4 text-[#FF0000] transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#000000] text-[#ffffff]">
        <div className="mx-auto grid max-w-[1480px] gap-10 px-5 py-16 md:px-8 lg:grid-cols-[1fr_auto] lg:items-center lg:py-20">
          <div>
            <p className="text-[12px] uppercase leading-[1.78] text-[#FF0000]">Ready state</p>
            <h2 className="mt-4 max-w-[820px] text-[42px] font-medium uppercase leading-[1.02] sm:text-[58px]">
              Launch the race floor with a sharper first impression.
            </h2>
          </div>
          <Link
            to="/main-menu.html"
            className="group inline-flex min-h-[54px] items-center justify-center gap-3 border border-[#ffffff] px-6 text-[12px] uppercase leading-[1.5] text-[#ffffff] hover:border-[#FF0000]"
          >
            Start racing
            <ArrowRight className="h-4 w-4 text-[#FF0000] transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#303030] bg-[#000000] text-[#8f8f8f]">
        <div className="mx-auto grid max-w-[1480px] gap-8 px-5 py-8 text-[11px] uppercase leading-[1.78] md:grid-cols-[1fr_auto] md:px-8">
          <div className="flex flex-wrap gap-6">
            <span className="text-[#ffffff]">Rialo Race</span>
            <span>Precision landing concept</span>
            <span>2026</span>
          </div>
          <div className="flex flex-wrap gap-6 md:justify-end">
            <Link className="hover:text-[#ffffff]" to="/landing.html">
              Original landing
            </Link>
            <Link className="hover:text-[#ffffff]" to="/profile.html">
              Profile
            </Link>
            <Link className="hover:text-[#ffffff]" to="/rewards.html">
              Rewards
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
