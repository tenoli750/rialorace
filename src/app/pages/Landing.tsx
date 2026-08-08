import { useState, type ReactNode } from "react";
import { Dices, Info, Play, Trophy } from "lucide-react";
import { Link } from "react-router";

const aboutSections = [
  {
    number: "01",
    title: "Live Market Races",
    image: "/assets/about-live-market.png",
    preview: "screenshot",
    body:
      "Every track turns token movement into a race. Four racers line up, the market data moves, and the race view makes the result easy to read without staring at raw charts."
  },
  {
    number: "02",
    title: "Pick Your Racers",
    image: "/assets/about-pick-racers.png",
    preview: "screenshot",
    body:
      "Choose a market, read the token lineup, and place your prediction before the run. The app keeps the flow simple: pick, watch, then review the result."
  },
  {
    number: "03",
    title: "Race Lotto",
    image: "/assets/about-race-lotto.png",
    preview: "screenshot",
    body:
      "Race Lotto is a perfect-six side mode. Pick winners across six matchups, then wait for the 10:00 and 22:00 KST result windows."
  },
  {
    number: "04",
    title: "Replay And History",
    image: "/assets/about-replay-history.png",
    preview: "screenshot",
    body:
      "Finished races are not lost. Replay screens and history records let you check targets, picks, final results, payout status, and point movement."
  },
  {
    number: "05",
    title: "Points Loop",
    image: "/assets/about-points-symbol.png",
    shape: "circle",
    body:
      "Points are the arcade credits of Rialo Race. Use them for entries, recharge through the points page, and track every change through history."
  }
];

export function Landing() {
  const [showAbout, setShowAbout] = useState(false);
  const [showIntro, setShowIntro] = useState(true);

  return (
    <MonitorShell>
      {showIntro ? (
        <IntroVideo onDone={() => setShowIntro(false)} />
      ) : showAbout ? (
        <AboutScreen onBack={() => setShowAbout(false)} />
      ) : (
        <TitleScreen onAbout={() => setShowAbout(true)} />
      )}
    </MonitorShell>
  );
}

function IntroVideo({ onDone }: { onDone: () => void }) {
  return (
    <section className="absolute inset-0 z-20 overflow-hidden bg-black">
      <video
        src="/assets/landing-intro-race.mp4"
        className="h-full w-full object-cover"
        autoPlay
        muted
        playsInline
        onEnded={onDone}
        onError={onDone}
      />
      <button
        type="button"
        onClick={onDone}
        className="absolute bottom-4 right-4 rounded border border-white/20 bg-black/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45 backdrop-blur-sm transition-colors hover:border-white/45 hover:bg-black/25 hover:text-white/80 sm:bottom-6 sm:right-6"
      >
        Skip
      </button>
    </section>
  );
}

function MonitorShell({ children }: { children: ReactNode }) {
  return (
    <main className="h-screen overflow-hidden bg-[#efebe0] p-2 text-[#171310] sm:p-4">
      <div className="mx-auto h-full max-w-[1500px]">
        <div className="flex h-full flex-col rounded-lg border border-[#aaa491] bg-[#d8d3c2] p-3 shadow-[0_30px_70px_rgba(23,19,16,0.28),inset_0_2px_0_rgba(255,255,255,0.6)] sm:p-5 lg:p-7">
          <div className="min-h-0 flex-1 rounded-md border border-[#aaa491] bg-[#c9c4b3] p-3 shadow-[inset_0_0_24px_rgba(23,19,16,0.22)] sm:p-5">
            <div className="h-full rounded-md bg-[#111] p-2 shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]">
              <div className="relative h-full overflow-hidden rounded bg-black font-mono text-[#ff7a00]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,122,0,0.14),transparent_34%),linear-gradient(180deg,rgba(255,122,0,0.08),transparent_28%,rgba(255,122,0,0.08))]" />
                <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:repeating-linear-gradient(0deg,transparent_0,transparent_5px,rgba(255,122,0,0.2)_6px)]" />
                <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_46px_rgba(0,0,0,0.9)]" />
                {children}
              </div>
            </div>
          </div>
          <div className="mt-3 flex h-12 shrink-0 items-center justify-center gap-4 sm:mt-4 sm:h-14">
            <span className="h-3 w-3 rounded-full bg-[#ff9d00] shadow-[0_0_10px_rgba(255,157,0,0.95)]" />
            {[0, 1, 2, 3].map((button) => (
              <span
                key={button}
                className="h-4 w-9 rounded-full border border-[#8f8a7a] bg-[#d4cfbd] shadow-[inset_0_2px_2px_rgba(255,255,255,0.6),0_2px_4px_rgba(23,19,16,0.35)] sm:h-5 sm:w-10"
              />
            ))}
            <span className="grid h-10 w-10 place-items-center rounded-md border border-[#8f8a7a] bg-[#c8c2b0] text-[#8f8a7a] shadow-[inset_0_2px_2px_rgba(255,255,255,0.55),0_2px_4px_rgba(23,19,16,0.28)] sm:h-12 sm:w-12">
              |
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}

function TitleScreen({ onAbout }: { onAbout: () => void }) {
  return (
    <section className="relative grid h-full content-center overflow-hidden px-5 py-5">
      <video
        src="/assets/menu-background-loop.mp4"
        className="absolute inset-0 h-full w-full object-cover opacity-55"
        autoPlay
        muted
        loop
        playsInline
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.18),rgba(0,0,0,0.86)_78%),linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.62))]" />
      <div className="relative z-10 mx-auto mb-7 w-full max-w-[1100px] text-center sm:mb-10">
        <div
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center text-[#ff7a00] sm:h-28 sm:w-28 lg:h-32 lg:w-32"
          style={{ filter: "drop-shadow(0 0 10px rgba(255,122,0,0.95)) drop-shadow(0 0 28px rgba(255,122,0,0.55))" }}
        >
          <RialoSymbol />
        </div>
        <h1
          className="mx-auto max-w-[920px] text-center text-5xl font-black uppercase leading-[0.82] tracking-normal sm:text-7xl lg:text-9xl"
          style={{ textShadow: "0 0 10px rgba(255,122,0,0.9), 8px 8px 0 #2a1000" }}
        >
          Rialo
          <br />
          Race
        </h1>
      </div>

      <nav className="relative z-10 mx-auto grid w-full max-w-[520px] gap-2 sm:gap-4">
        <MenuLink label="Enter APP" href="/home" icon={Play} />
        <MenuLink label="Slot" href="/slot" icon={Dices} />
        <button
          type="button"
          onClick={onAbout}
          className="group grid h-11 grid-cols-[36px_1fr_36px] items-center border border-transparent px-3 text-center text-xl uppercase text-[#e46a00] transition-colors hover:border-[#ff7a00] hover:bg-[#ff7a00]/10 hover:text-[#ff9d00] sm:h-14 sm:grid-cols-[44px_1fr_44px] sm:text-4xl"
        >
          <Info className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100" />
          <span>About</span>
          <span className="text-[#ffb000] opacity-0 transition-opacity group-hover:opacity-100">&gt;</span>
        </button>
        <MenuLink label="Highscores" href="/community.html" icon={Trophy} />
      </nav>
    </section>
  );
}

function RialoSymbol() {
  return (
    <svg viewBox="0 45 90 92" role="img" aria-label="Rialo symbol" className="h-full w-full">
      <path
        d="m30.71 52.8c-5.62 0-8.38 5.13-8.38 8.1 0 5.5 4.16 8.03 8.23 8.03h10.31c6.98 0 9.14 4.2 8.14 8.85-0.89 4.29-5.02 7.23-9.4 7.23h-25.78c-6.24 0-7.83 5.97-7.83 8.05 0 6.28 4.71 8.17 7.49 8.17h27.06c9.43 0 9.11 7.53 9.11 8.39v14.5c0 6.26 4.82 8.64 8.26 8.64 6.92 0 8.6-6.48 8.6-8.64v-14.16c0-6.15-4.77-8.42-8.88-8.42-5.03 0-7.83-4.97-7.28-8.52 0.65-4.1 3.59-7.36 9.77-7.36h14.74c5.64 0 8.79-4.71 8.79-8.43 0-3.55-2.18-7.75-8.24-7.75-5.61 0-8.86-3.67-9.06-8.27-0.24-5.16-3.58-8.41-8.3-8.41h-27.35z"
        fill="currentColor"
      />
    </svg>
  );
}

function MenuLink({
  label,
  href,
  icon: Icon
}: {
  label: string;
  href: string;
  icon: typeof Play;
}) {
  return (
    <Link
      to={href}
      className="group grid h-11 grid-cols-[36px_1fr_36px] items-center border border-transparent px-3 text-center text-xl uppercase text-[#e46a00] transition-colors hover:border-[#ff7a00] hover:bg-[#ff7a00]/10 hover:text-[#ff9d00] sm:h-14 sm:grid-cols-[44px_1fr_44px] sm:text-4xl"
    >
      <Icon className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100" />
      <span>{label}</span>
      <span className="text-[#ffb000] opacity-0 transition-opacity group-hover:opacity-100">&gt;</span>
    </Link>
  );
}

function AboutScreen({ onBack }: { onBack: () => void }) {
  return (
    <section className="relative mx-auto flex h-full max-w-[980px] flex-col px-3 py-3 sm:px-5 sm:py-5">
      <div className="z-10 mb-3 flex shrink-0 items-center justify-between gap-4 border border-[#5a2400] bg-black/80 px-4 py-3">
        <h1
          className="text-2xl uppercase text-[#ff7a00] sm:text-4xl"
          style={{ textShadow: "0 0 8px rgba(255,122,0,0.85), 4px 4px 0 #2a1000" }}
        >
          About
        </h1>
        <button
          type="button"
          onClick={onBack}
          className="group grid h-10 w-[132px] grid-cols-[28px_1fr_28px] items-center border border-transparent px-2 text-center text-base uppercase text-[#e46a00] transition-colors hover:border-[#ff7a00] hover:bg-[#ff7a00]/10 hover:text-[#ff9d00]"
        >
          <span className="text-[#ffb000] opacity-0 transition-opacity group-hover:opacity-100">&lt;</span>
          <span>Back</span>
          <span />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-color:#ff7a00_#1a0b00] [scrollbar-width:thin]">
        <div className="grid gap-5 pb-6">
          <section className="grid gap-5 border border-[#5a2400] bg-black/70 p-5 sm:grid-cols-[190px_1fr] sm:p-7">
            <div
              className="mx-auto flex h-36 w-36 items-center justify-center text-[#ff7a00] sm:h-44 sm:w-44"
              style={{ filter: "drop-shadow(0 0 10px rgba(255,122,0,0.95)) drop-shadow(0 0 28px rgba(255,122,0,0.55))" }}
            >
              <RialoSymbol />
            </div>
            <div className="self-center text-center sm:text-left">
              <p className="text-xs uppercase tracking-[0.28em] text-[#ffb000]">Field Guide</p>
              <h2
                className="mt-3 text-3xl uppercase text-[#ff7a00] sm:text-5xl"
                style={{ textShadow: "0 0 8px rgba(255,122,0,0.85), 4px 4px 0 #2a1000" }}
              >
                Rialo Race
              </h2>
              <p className="mt-5 text-sm uppercase leading-7 text-[#e46a00] sm:text-base sm:leading-8">
                Rialo Race is an arcade layer for live crypto competition. It turns market movement,
                animal racers, points, replay, and lotto into one readable game loop.
              </p>
            </div>
          </section>

          {aboutSections.map((section, index) => (
            <AboutSection key={section.title} section={section} reverse={index % 2 === 1} />
          ))}

          <section className="border border-[#5a2400] bg-black/70 p-5 text-center sm:p-7">
            <Link
              to="/home"
              className="mx-auto grid h-12 max-w-[360px] grid-cols-[40px_1fr_40px] items-center border border-[#ff7a00] bg-[#ff7a00]/10 px-4 text-xl uppercase text-[#ff9d00] shadow-[0_0_18px_rgba(255,122,0,0.35)] transition-colors hover:bg-[#ff7a00]/20 hover:text-[#ffd28a] sm:h-14 sm:text-3xl"
            >
              <Play className="h-5 w-5" />
              <span>Enter App</span>
              <span className="text-[#ffb000]">&gt;</span>
            </Link>
          </section>
        </div>
      </div>
    </section>
  );
}

function AboutSection({
  section,
  reverse
}: {
  section: (typeof aboutSections)[number];
  reverse: boolean;
}) {
  return (
    <article
      className={`grid gap-5 border border-[#5a2400] bg-black/70 p-5 sm:p-6 ${
        section.preview ? "sm:grid-cols-[1fr_minmax(300px,420px)]" : "sm:grid-cols-[1fr_210px]"
      }`}
    >
      <div className={reverse ? "sm:order-2" : ""}>
        <div className="text-xs uppercase tracking-[0.28em] text-[#ffb000]">{section.number}</div>
        <h2 className="mt-3 text-2xl uppercase text-[#ff7a00] sm:text-4xl">{section.title}</h2>
        <p className="mt-4 text-sm uppercase leading-7 text-[#c75d00] sm:text-base sm:leading-8">
          {section.body}
        </p>
      </div>
      <div className={`flex min-h-40 items-center justify-center border border-[#5a2400] bg-[#1a0b00] p-3 ${reverse ? "sm:order-1" : ""}`}>
        {section.preview === "race-lotto" ? (
          <div className="relative h-44 w-full overflow-hidden border border-[#c75d00] bg-[#1a0b00] shadow-[0_0_18px_rgba(255,122,0,0.25)]">
            <iframe
              title="Race Lotto preview"
              src="/race-lotto"
              className="pointer-events-none absolute left-0 top-0 h-[760px] w-[1320px] origin-top-left scale-[0.18] border-0 sm:scale-[0.25]"
            />
          </div>
        ) : section.preview === "screenshot" ? (
          <div className="relative h-52 w-full overflow-hidden border border-[#c75d00] bg-[#1a0b00] shadow-[0_0_18px_rgba(255,122,0,0.25)] sm:h-56">
            <img
              src={section.image}
              alt=""
              className="h-full w-full object-contain"
            />
          </div>
        ) : (
          <img
            src={section.image}
            alt=""
            className={`max-h-36 max-w-full object-contain ${
              section.shape === "circle" ? "aspect-square rounded-full border border-[#ff7a00]/40" : ""
            }`}
            style={{ filter: "drop-shadow(0 0 10px rgba(255,122,0,0.55))" }}
          />
        )}
      </div>
    </article>
  );
}
