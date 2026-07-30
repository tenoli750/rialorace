const runtimeConfig = globalThis.RIALO_SUPABASE_CONFIG || {};

export const PUBLIC_SUPABASE_CONFIG = {
  "url": runtimeConfig.url || "https://rialorace.duckdns.org",
  "publishableKey": runtimeConfig.publishableKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg0MzA1ODEwLCJleHAiOjE5NDE5ODU4MTB9.QokTW2iTViq5nvwYlv4Ssc3y5vVgtWJpNV7iaKgYBr0"
};
