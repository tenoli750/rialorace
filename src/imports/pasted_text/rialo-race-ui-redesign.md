  Create a complete responsive UI redesign for Rialo Race based on the current local site at http://localhost:8001/main-menu.html.

  Product context:
  Rialo Race is a crypto animal racing and betting web app. Users browse live markets, watch 3D animal races, place first/second/third prediction
  bets, view replay history, chat, claim rewards, check rankings, and review betting history.

  Design goal:
  Redesign all pages into one cohesive polished product UI while preserving the existing structure, labels, and core flows. Keep it playful,
  premium, readable, and fast to understand. Use the provided Rialo Race logo image as the main brand mark in the header. Do not make it look
  like a crypto exchange dashboard. It should feel like a live racing game with betting controls.

  Brand and visual direction:
  - Use the existing Rialo Race logo from the page header as the brand mark.
  - Keep the current soft green/off-white background direction, but make it more refined.
  - Avoid purple/blue gradient themes, beige-heavy themes, dark navy/slate themes, and brown/orange-heavy themes.
  - Use a clean light theme with deep forest green, off-white panels, soft mint accents, and small high-contrast status colors.
  - Cards and buttons should have border radius 8px or less.
  - No decorative gradient orbs or bokeh blobs.
  - Use strong typography, compact labels, and clear hierarchy.
  - Keep text readable on mobile and desktop.
  - Do not put cards inside cards.

  Pages to design:
  1. Main menu / Live Markets
  2. Live betting market page
  3. Replay menu
  4. Replay page
  5. Rankings page
  6. Rewards page
  7. History / My Bets page
  8. Login page
  9. Profile page

  Global header:
  - Logo above the navigation, using the current Rialo Race logo asset.
  - Navigation row: Live Markets, Replay, Rankings, Rewards, History, Points, Login/Profile.
  - The active nav item should be clear but subtle.
  - Header must fit cleanly on desktop and wrap gracefully on mobile.

  Main menu / Live Markets:
  - Primary content is a grid of market cards.
  - Keep token legend A-J visible and usable.
  - Market cards should show market number, token symbols, and animal/token pills.
  - Make cards feel clickable with hover/pressed states.
  - Avoid a generic landing page. This page should immediately show the app experience.

  Live betting market page:
  - Main layout: 3:1 ratio with livestream/3D race area on the left and side panel on the right.
  - Keep the race viewport dominant.
  - Animal standings cards should sit at the top of the live screen during active races.
  - During “Next Race Soon”, ranking cards should appear centered in the live screen, with “Next Race” under the cards.
  - Bet slip stays below the livestream, not on the right.
  - Right panel is Bet History with tabs: Now, Next, Past, Chat.
  - Bet History box must have fixed vertical height equal to livestream height and scroll internally.
  - Chat tab should have a long chat box that fills the panel and keeps recent messages at the bottom.
  - Hide unnecessary status copy during next race states.
  - Keep controls like Camera and Logos compact inside the viewport.

  Bet slip:
  - User chooses first, second, third.
  - Show bet type: Single, Double, Triple.
  - Show potential winnings instead of generic “100 points on no picks.”
  - Selected picks are visible in buttons, so avoid repeating “1st ETH, 2nd XRP...” in extra text.
  - Make stake input and place bet action obvious.

  Replay page:
  - Main layout should match live page proportions.
  - Replay history panel should match live Bet History panel height/style.
  - Replay history rows should be compact clickable buttons.
  - Ten rows should fit vertically.
  - Active replay row should highlight green.
  - Show race date/time and ranks on separate lines:
    Line 1: 15/04, 04:15:00 KST
    Line 2: 1.SOL 2.ETH 3.BNB 4.TRX

  Rankings page:
  - Show every user ranked by points.
  - Names should look natural and readable.
  - Ranking rows should be simple, dense, and clear:
    rank, player name, points.
  - Make top 3 visually distinct without overdecorating.

  Rewards page:
  - Add Daily Check-In as the main reward.
  - User can claim 100 pts once per day.
  - Reset copy: KST 00:00.
  - States: Ready to Claim, Claimed Today, Login Required.
  - Show current points balance and next reset time.
  - Make the claim button prominent but not oversized.

  History / My Bets page:
  - Header nav label is “History.”
  - Page title can remain “My Bets.”
  - Summary cards: Total Bets, Won, Lost, PnL.
  - PnL should show positive with plus sign and negative with minus sign.
  - Bet rows should showUse this prompt in Figma Make / Figma AI. It is written to redesign the full app while preserving your current structure
  and behavior.

  ```text
  Redesign the full “Rialo Race” web app starting from this local site:
  http://localhost:8001/main-menu.html

  Goal:
  Create a polished, consistent production UI for every page in the app while preserving the existing user flow, page structure, labels, and
  functional elements. This is a crypto animal racing betting app. The design should feel like a premium live sports/racing dashboard, not a
  generic crypto dashboard.

  Brand:
  Use the existing Rialo Race logo image from the page header. Keep the logo as the main brand mark above the navigation.
  Overall mood: clean, energetic, competitive, modern race-broadcast interface.
  Avoid a dark blue/slate-heavy look, purple gradients, beige/tan palettes, and orange/brown palettes.
  Use a fresh palette with off-white surfaces, deep green/charcoal text, sharp accent green, racing red for losses, and restrained gold for
  winners.
  Use rounded corners no larger than 8px for buttons and cards.

  Pages to redesign:
  1. Main menu / live markets
  2. Market live betting pages
  3. Replay menu
  4. Market replay page
  5. Rankings
  6. Rewards
  7. History / My Bets
  8. Login
  9. Profile

  Global layout requirements:
  - Keep the top logo above the navigation.
  - Keep the nav items in this order:
    Live Markets, Replay, Rankings, Rewards, History, Points, Login/Profile
  - Make the header/nav consistent across all pages.
  - Improve spacing and visual hierarchy.
  - Keep every page responsive for desktop and mobile.
  - Text must never overflow or collide.
  - Do not add marketing hero sections. The app should start with the actual usable experience.
  - Do not use decorative gradient orbs or bokeh blobs.
  - Do not put cards inside cards.

  Main Menu:
  - Redesign the Token Legend and market grid.
  - Token legend should feel like selectable filter chips/cards.
  - Market cards should clearly show market number, included tokens, and animal icons.
  - Make market cards look clickable with hover-ready styling.
  - Keep the main menu fast to scan.

  Live Market Page:
  - Preserve the large Three.js live race viewport as the primary element.
  - Keep it full-width/large, not framed like a preview.
  - Keep the right sidebar aligned to the live viewport height.
  - Right sidebar contains Market Bet History with tabs:
    Now, Next, Past, Chat
  - Bet history must be visually compact and scroll inside the panel.
  - Keep the bet slip below the live viewport.
  - During “Next Race Soon”, animal ranking cards should sit cleanly at the top/center area of the live viewport.
  - Post-race winner/ranking cards should be visually prominent, using the animal icons.
  - Keep current labels and betting flows.

  Replay Page:
  - Match the live page visual language.
  - Replay history should look like compact clickable buttons.
  - Selected replay item should be highlighted green.
  - Fit about 10 replay rows in the panel.
  - Keep each replay row readable with:
    Game number
    KST time
    ranking line below the time

  Rankings Page:
  - Make rankings look like a leaderboard.
  - Strong rank numbers.
  - Player name and points clearly separated.
  - Top 3 should feel special but not overdecorated.

  Rewards Page:
  - Highlight Daily Check-In.
  - Show current claim status, reward amount, balance, and next KST reset.
  - Claim button should be clear and disabled state should look intentional.
  - Keep copy concise.

  History / My Bets Page:
  - Header nav says “History”.
  - Page content may say “My Bets” or “Bet History”.
  - Show summary cards:
    Total Bets, Won, Lost, PnL
  - PnL must visually support positive and negative states.
  - Bet history rows should show:
    market, target race time, pick, stake, status, PnL, matched result
  - Make lost bets easy to identify without overwhelming the layout.

  Login/Profile:
  - Keep forms clean and compact.
  - Profile should show username, points balance, and account actions clearly.

  Visual style:
  - Use a disciplined layout grid.
  - Background: soft off-white or very light green-gray.
  - Panels: white or near-white with subtle border.
  - Primary text: deep green/charcoal.
  - Active nav/tab/button: deep green background with white text.
  - Positive/win: green.
  - Negative/loss: muted red.
  - Winner/gold accents: minimal, only for top placement or special status.
  - Border radius: 8px max.
  - Buttons should be clearly clickable with hand cursor affordance.
  - Use consistent icon/avatar sizing.

  Assets:
  - Use the existing logo in the header.
  - Use existing animal/token icons from the app assets.
  - Do not replace the Three.js race scene.
  - Do not invent new unrelated illustrations.

  Output:
  Produce a complete Figma design system and page mockups for all listed pages.
  Include reusable components for:
  - Header/nav
  - Market card
  - Token chip
  - Live race panel
  - Bet history panel
  - Bet history tabs
  - Bet slip
  - Replay history row
  - Ranking row
  - Summary stat card
  - Daily check-in card
  - Form fields/buttons

  Important:
  Preserve the current app’s information architecture and labels. Improve the UI design only. Do not remove betting, race, replay, rankings,
  rewards, chat, history, login, or profile functionality.