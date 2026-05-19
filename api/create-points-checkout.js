import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://xafeoxmfhlbovzohjaam.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_9HD-9e45AJgx5EIJXpiKsg__M75Ebad";

const POINT_PACKAGES = {
  starter: {
    name: "Starter Points",
    points: 1000,
    amount: 100
  },
  booster: {
    name: "Booster Points",
    points: 5500,
    amount: 500
  },
  vault: {
    name: "Vault Points",
    points: 12000,
    amount: 1000
  }
};

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }
  return new Stripe(secretKey);
}

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY ?? DEFAULT_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function getSiteUrl(req) {
  const configuredUrl = process.env.PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (configuredUrl) {
    return configuredUrl.startsWith("http") ? configuredUrl : `https://${configuredUrl}`;
  }

  const origin = req.headers.origin;
  if (origin) return origin;

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const protocol = req.headers["x-forwarded-proto"] || "https";
  return host ? `${protocol}://${host}` : "http://localhost:8002";
}

function getPaymentMethodTypes() {
  return (process.env.STRIPE_PAYMENT_METHOD_TYPES || "")
    .split(",")
    .map((method) => method.trim())
    .filter(Boolean);
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const body = await readJsonBody(req);
    const packageId = String(body.packageId || "");
    const sessionToken = String(body.sessionToken || "");
    const pointPackage = POINT_PACKAGES[packageId];

    if (!pointPackage) {
      return res.status(400).json({ error: "Unknown points package." });
    }

    if (!sessionToken) {
      return res.status(401).json({ error: "Login required." });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("get_login_session", {
      requested_session_token: sessionToken
    });
    const loginSession = firstRow(data);

    if (error || !loginSession?.account_id) {
      return res.status(401).json({ error: "Login session expired." });
    }

    const stripe = getStripe();
    const siteUrl = getSiteUrl(req);
    const metadata = {
      account_id: String(loginSession.account_id),
      login_id: String(loginSession.login_id || ""),
      package_id: packageId,
      points: String(pointPackage.points)
    };

    const sessionParams = {
      mode: "payment",
      client_reference_id: String(loginSession.account_id),
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Rialo ${pointPackage.name}`,
              description: `${pointPackage.points.toLocaleString()} test points`
            },
            unit_amount: pointPackage.amount
          },
          quantity: 1
        }
      ],
      metadata,
      payment_intent_data: {
        metadata
      },
      success_url: `${siteUrl}/rewards.html?points_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/rewards.html?points_checkout=cancelled`
    };

    const paymentMethodTypes = getPaymentMethodTypes();
    if (paymentMethodTypes.length > 0) {
      sessionParams.payment_method_types = paymentMethodTypes;
    }

    const checkoutSession = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({
      checkoutUrl: checkoutSession.url
    });
  } catch (error) {
    console.error("Create points checkout failed", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not start checkout."
    });
  }
}
