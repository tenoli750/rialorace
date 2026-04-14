import { createBrowserRouter } from "react-router";
import { Root } from "./components/Root";
import { MainMenu } from "./pages/MainMenu";
import { LiveMarket } from "./pages/LiveMarket";
import { ReplayMenu } from "./pages/ReplayMenu";
import { ReplayMarket } from "./pages/ReplayMarket";
import { Rankings } from "./pages/Rankings";
import { Rewards } from "./pages/Rewards";
import { History } from "./pages/History";
import { Login } from "./pages/Login";
import { Profile } from "./pages/Profile";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: MainMenu },
      { path: "main-menu.html", Component: MainMenu },
      { path: "market/:marketId", Component: LiveMarket },
      { path: "market.html", Component: LiveMarket },
      { path: "market01-betting.html", Component: LiveMarket },
      { path: "market02-betting.html", Component: LiveMarket },
      { path: "replay", Component: ReplayMenu },
      { path: "replay-menu.html", Component: ReplayMenu },
      { path: "replay/:marketId", Component: ReplayMarket },
      { path: "market-replay.html", Component: ReplayMarket },
      { path: "rankings", Component: Rankings },
      { path: "community.html", Component: Rankings },
      { path: "rewards", Component: Rewards },
      { path: "rewards.html", Component: Rewards },
      { path: "history", Component: History },
      { path: "my-bets.html", Component: History },
      { path: "login", Component: Login },
      { path: "login.html", Component: Login },
      { path: "profile", Component: Profile },
      { path: "profile.html", Component: Profile },
    ],
  },
]);
