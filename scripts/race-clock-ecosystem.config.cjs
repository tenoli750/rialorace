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
        SUPABASE_URL: "https://xafeoxmfhlbovzohjaam.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_9HD-9e45AJgx5EIJXpiKsg__M75Ebad",
        RACE_BROWSER_OFFICIAL_RESOLVED_BY: "vps-browser",
        RACE_BROWSER_OFFICIAL_RESOLVER_VERSION: "vps-frontend-v1",
        RACE_BROWSER_MARKETS:
          "market-01,market-02,market-03,market-04,market-05,market-06,market-07,market-08,market-09,market-10,market-11,market-12,market-13,market-14,market-15,market-16,market-17,market-18,market-19,market-20"
      }
    }
  ]
};
