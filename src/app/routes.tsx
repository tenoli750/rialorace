import { createBrowserRouter } from "react-router";
import { AppLayout } from "./components/AppLayout";
import { Root } from "./components/Root";
import { Landing } from "./pages/Landing";
import { PrecisionLanding } from "./pages/PrecisionLanding";
import { Home } from "./pages/Home";
import { LiveMarkets, MainMenuRedirect } from "./pages/LiveMarkets";
import { LiveMarket } from "./pages/LiveMarket";
import { ReplayMenu } from "./pages/ReplayMenu";
import { ReplayMarket } from "./pages/ReplayMarket";
import { Rankings } from "./pages/Rankings";
import { Rewards } from "./pages/Rewards";
import { Points } from "./pages/Points";
import { History } from "./pages/History";
import { RaceLotto } from "./pages/RaceLotto";
import { Login } from "./pages/Login";
import { Profile } from "./pages/Profile";
import { Shop } from "./pages/Shop";
import { RwaSlot } from "./pages/RwaSlot";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AppLayout,
    children: [
      { index: true, Component: Landing },
      { path: "landing", Component: Landing },
      { path: "landing.html", Component: Landing },
      { path: "precision-landing", Component: PrecisionLanding },
      { path: "precision-landing.html", Component: PrecisionLanding },
      {
        Component: Root,
        children: [
          { path: "home", Component: Home },
          { path: "home.html", Component: Home },
          { path: "main-menu.html", Component: MainMenuRedirect },
          { path: "live-markets.html", Component: LiveMarkets },
          { path: "market", Component: LiveMarket },
          { path: "market/:marketId", Component: LiveMarket },
          { path: "markets/:marketId", Component: LiveMarket },
          { path: "market.html", Component: LiveMarket },
          { path: "market01-betting", Component: LiveMarket },
          { path: "market01-betting.html", Component: LiveMarket },
          { path: "market02-betting", Component: LiveMarket },
          { path: "market02-betting.html", Component: LiveMarket },
          { path: "betting", Component: LiveMarket },
          { path: "betting/:marketId", Component: LiveMarket },
          { path: "betting.html", Component: LiveMarket },
          { path: "replay", Component: ReplayMenu },
          { path: "replay-menu.html", Component: ReplayMenu },
          { path: "replay/:marketId", Component: ReplayMarket },
          { path: "market-replay.html", Component: ReplayMarket },
          { path: "race-lotto", Component: RaceLotto },
          { path: "lotto", Component: RaceLotto },
          { path: "rwa-slot", Component: RwaSlot },
          { path: "slot", Component: RwaSlot },
          { path: "paxg-slot", Component: RwaSlot },
          { path: "shop", Component: Shop },
          { path: "shop.html", Component: Shop },
          { path: "rankings", Component: Rankings },
          { path: "community.html", Component: Rankings },
          { path: "rewards", Component: Rewards },
          { path: "rewards.html", Component: Rewards },
          { path: "points", Component: Points },
          { path: "points.html", Component: Points },
          { path: "history", Component: History },
          { path: "my-bets.html", Component: History },
          { path: "login", Component: Login },
          { path: "login.html", Component: Login },
          { path: "profile", Component: Profile },
          { path: "profile.html", Component: Profile },
          { path: ":marketId", Component: LiveMarket }
        ]
      }
    ]
  }
]);
