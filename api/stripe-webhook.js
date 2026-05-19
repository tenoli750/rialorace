import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: {
    bodyParser: false
  }
};

const DEFAULT_SUPABASE_URL = "https://xafeoxmfhlbovzohjaam.supabase.co";

const POINT_PACKAGES = {
  starter: {
    points: 1000,
    amount: 100
  },
  booster: {
    points: 5500,
    amount: 500
  },
  vault: {
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

function getSupabaseAdmin() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function getPaymentIntentId(session) {
  if (!session.payment_intent) return null;
  if (typeof session.payment_intent === "string") return session.payment_intent;
  return session.payment_intent.id ?? null;
}

function validatePointPackage(session) {
  const packageId = session.metadata?.package_id;
  const pointPackage = packageId ? POINT_PACKAGES[packageId] : null;
  const points = Number(session.metadata?.points ?? 0);

  if (!packageId || !pointPackage) {
    throw new Error("Checkout session has an unknown points package.");
  }

  if (points !== pointPackage.points || session.amount_total !== pointPackage.amount) {
    throw new Error("Checkout session amount does not match the points package.");
  }

  return {
    packageId,
    points
  };
}

async function creditPointsForSession(session, eventId) {
  if (session.payment_status !== "paid") {
    return {
      skipped: true,
      reason: `Payment status is ${session.payment_status}.`
    };
  }

  const accountId = session.metadata?.account_id || session.client_reference_id;
  if (!accountId) {
    throw new Error("Checkout session is missing account_id metadata.");
  }

  const { packageId, points } = validatePointPackage(session);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("credit_points_purchase_from_stripe", {
    requested_account_id: accountId,
    requested_checkout_session_id: session.id,
    requested_payment_intent_id: getPaymentIntentId(session),
    requested_stripe_event_id: eventId,
    requested_package_id: packageId,
    requested_amount_total: session.amount_total ?? 0,
    requested_currency: session.currency ?? "usd",
    requested_points_awarded: points
  });

  if (error) throw error;
  return {
    skipped: false,
    purchase: Array.isArray(data) ? data[0] ?? null : data
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("Missing STRIPE_WEBHOOK_SECRET.");
    }

    const signature = req.headers["stripe-signature"];
    const rawBody = await readRawBody(req);
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const result = await creditPointsForSession(event.data.object, event.id);
      return res.status(200).json({ received: true, result });
    }

    return res.status(200).json({ received: true, ignored: event.type });
  } catch (error) {
    console.error("Stripe webhook failed", error);
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Webhook failed."
    });
  }
}
