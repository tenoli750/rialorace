# Stripe Test Points

This test integration sells app points through Stripe Checkout and credits points only from a verified Stripe webhook.

## Vercel Environment Variables

Set these on the Vercel project before testing checkout:

```text
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_URL=https://xafeoxmfhlbovzohjaam.supabase.co
PUBLIC_SITE_URL=https://rialoracev1.vercel.app
BASE_SEPOLIA_TREASURY_ADDRESS=0x...
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

Optional:

```text
STRIPE_PAYMENT_METHOD_TYPES=card,crypto
```

Leave `STRIPE_PAYMENT_METHOD_TYPES` unset to let Stripe Checkout use the payment methods enabled in the Stripe Dashboard. Use `card,crypto` only after the Stripe account has crypto/stablecoin payments enabled.

`BASE_SEPOLIA_TREASURY_ADDRESS` must be a separate EVM wallet address that receives Base Sepolia test USDC. Do not use the same wallet that pays from the browser.

## Webhook

Create a Stripe webhook endpoint:

```text
https://rialoracev1.vercel.app/api/stripe-webhook
```

Subscribe to:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
```

## Test Packages

```text
$1  -> 1,000 points
$5  -> 5,500 points
$10 -> 12,000 points
```

## Local Stripe CLI Test

Run the app through Vercel dev so `/api/*` functions are available:

```bash
vercel dev --listen 8002
```

```bash
stripe listen --forward-to localhost:8002/api/stripe-webhook
```

## Local Base Sepolia USDC Test

The local helper server can run the built frontend and `/api/*` routes on one origin:

```bash
npm run dev:stripe
```

Open:

```text
http://127.0.0.1:8003/rewards.html
```

Base Sepolia settings:

```text
Chain ID: 84532
RPC: https://sepolia.base.org
USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

Get test funds:

```text
https://portal.cdp.coinbase.com/products/faucet
```
