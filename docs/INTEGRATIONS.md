# Payments, Stripe and LiveKit setup

## Payments: two modes, same flow

| Mode | When it is used | Needs |
|---|---|---|
| **Simulated checkout** (default) | `STRIPE_SECRET_KEY` is empty | nothing: no account, no keys |
| **Stripe test mode** | `STRIPE_SECRET_KEY=sk_test_...` is set (or `PAYMENT_PROVIDER=stripe`) | a Stripe account |

**Why there is a simulated mode:** a Stripe account may be unavailable or need verification before you can use it.
The simulated gateway removes that dependency so the whole purchase flow can still be built, tested and demonstrated.
It is a stand-in, **not** a real payment processor, and the demo and presentation should say so.

How it works: **Buy this course** creates a pending `Payment` (with the platform-fee split) and sends the student to
`/mock-checkout`, a page that looks like a hosted checkout. The card `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002`
is declined, and anything else is rejected. On success the server runs the same `fulfillSession()` function the Stripe webhook uses, so
enrollment, the 20% platform fee and the instructor earnings dashboard behave exactly as with Stripe.
The simulated endpoints return 404 whenever Stripe is the active provider, so they cannot be abused in a Stripe setup.
The real Stripe code stays in the project and takes over as soon as a key is set.

## Stripe (optional, test mode only)
1. Create a free account at stripe.com and stay in **Test mode** (toggle in the dashboard).
2. Developers, API keys, copy the **Secret key** (`sk_test_...`) into `STRIPE_SECRET_KEY`.
3. Restart the API. Create a **paid** course (price above 0), publish it, then log in as a different student and click Buy.
4. Pay with the test card `4242 4242 4242 4242`, any future expiry, any CVC, any postal code.
5. You land on `/payment/success`; the server confirms the payment and enrolls you. The instructor's Earnings page shows the sale and the 20% platform fee split.

**Webhook (optional locally, required when deployed).** The success page already confirms the payment, so you can skip this during development. To test the webhook:
```bash
stripe listen --forward-to localhost:5000/api/payments/webhook
```
Copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET` and restart the API.
(Install the Stripe CLI from stripe.com/docs/stripe-cli.)

## LiveKit Cloud (live classes with chat)
1. Sign up at livekit.io (free tier), create a project.
2. Settings, Keys: create a key. Copy the **WebSocket URL** (`wss://....livekit.cloud`), **API key**, **API secret** into `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Restart the API.
3. Instructor: open the course editor, Live classes, schedule a class, press **Go live**, then **Open room** and allow camera and microphone.
4. Student (enrolled, other browser): the course page shows **Join now**. Students receive video and audio and can use the chat panel.

How it works: our server never touches video. It only signs a short-lived token saying who you are and what you may do
(`canPublish` for the instructor only, `canPublishData` for chat for everyone). LiveKit's servers carry the WebRTC media.
