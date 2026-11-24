import PaddleCheckout from "./paddle-checkout";

export const metadata = {
  title: "Checkout — TRUXERA",
};

/**
 * Paddle checkout landing page. Paddle generates the transaction checkout
 * URL as `<approved-domain-url>?_ptxn=<transaction-id>`; this page loads
 * Paddle.js, which detects `_ptxn` and opens the checkout overlay.
 * Subscription activation still happens exclusively via validated Paddle
 * webhooks — this page is presentation only.
 */
export default function PaddleCheckoutPage() {
  const clientToken = process.env.PADDLE_CLIENT_TOKEN ?? null;
  return <PaddleCheckout clientToken={clientToken} />;
}
