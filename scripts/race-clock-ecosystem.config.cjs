module.exports = {
  apps: [
    {
      name: "rialo-race-clock-static",
      cwd: "/root/rialo-race-clock-profile",
      script: "scripts/static-public-server.js",
      interpreter: "node",
      env: {
        TZ: "Asia/Seoul",
        HOST: "127.0.0.1",
        PORT: "4178",
        STATIC_ROOT: "public"
      }
    },
    {
      name: "rialo-race-clock-browser",
      cwd: "/root/rialo-race-clock-profile",
      script: "scripts/vps-race-browser.js",
      interpreter: "node",
      env: {
        TZ: "Asia/Seoul",
        RACE_BROWSER_BASE_URL: "http://127.0.0.1:4178",
        RACE_BROWSER_HEADLESS: "true",
        RACE_BROWSER_CHECK_MS: "5000",
        RACE_BROWSER_OPEN_CONCURRENCY: "20",
        RACE_BROWSER_VIEWPORT_WIDTH: "960",
        RACE_BROWSER_VIEWPORT_HEIGHT: "720",
        RACE_BROWSER_TIME_ZONE: "Asia/Seoul",
        RACE_BROWSER_RELOAD_MS: "21600000",
        RACE_BROWSER_RECORD_OFFICIAL_RESULTS: "true",
        RACE_BROWSER_RECORD_PAGE_OFFICIAL_RESULTS: "true",
        SUPABASE_URL: "https://rialorace.duckdns.org",
        SUPABASE_PUBLISHABLE_KEY:
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg0MzA1ODEwLCJleHAiOjE5NDE5ODU4MTB9.QokTW2iTViq5nvwYlv4Ssc3y5vVgtWJpNV7iaKgYBr0",
        RACE_BROWSER_OFFICIAL_RESOLVED_BY: "vps-browser",
        RACE_BROWSER_OFFICIAL_RESOLVER_VERSION: "vps-frontend-v1",
        RACE_BROWSER_MARKETS:
          "market-01,market-02,market-03,market-04,market-05,market-06,market-07,market-08,market-09,market-10,market-11,market-12,market-13,market-14,market-15,market-16,market-17,market-18,market-19,market-20,stock-market-01,stock-market-02,stock-market-03,stock-market-04,stock-market-05,stock-market-06,stock-market-07,stock-market-08,stock-market-09,stock-market-10,stock-market-11,stock-market-12,stock-market-13,stock-market-14,stock-market-15,stock-market-16,stock-market-17,stock-market-18,stock-market-19,stock-market-20"
      }
    }
  ]
};
