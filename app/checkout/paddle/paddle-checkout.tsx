"use client";

import Script from "next/script";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type PaddleEvent = {
  name?: string;
  data?: { transaction_id?: string; id?: string };
};

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: "sandbox" | "production") => void };
      Initialize: (options: {
        token: string;
        eventCallback?: (event: PaddleEvent) => void;
      }) => void;
    };
  }
}

/**
 * Hosts Paddle.js and auto-opens the transaction checkout passed via the
 * `_ptxn` query parameter (appended by Paddle to the checkout URL we set
 * as `transaction.checkout.url`). Paddle.js requires an approved domain —
 * staging.truxera.net is approved in the Paddle dashboard.
 */
export default function PaddleCheckout({
  clientToken,
}: {
  clientToken: string | null;
}) {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [failed, setFailed] = useState(false);
  const didInit = useRef(false);

  const onPaddleEvent = useCallback((event: PaddleEvent) => {
    if (event?.name === "checkout.completed") {
      // Webhooks remain authoritative for subscription state; this only
      // returns the customer to the billing page notice.
      window.location.assign("/dashboard/billing?billing=checkout_success");
    }
  }, []);

  useEffect(() => {
    if (!clientToken || !scriptLoaded || didInit.current || !window.Paddle) {
      return;
    }
    didInit.current = true;
    try {
      if (clientToken.startsWith("test_")) {
        window.Paddle.Environment.set("sandbox");
      }
      window.Paddle.Initialize({
        token: clientToken,
        eventCallback: onPaddleEvent,
      });
      setInitialized(true);
    } catch {
      setFailed(true);
    }
  }, [clientToken, scriptLoaded, onPaddleEvent]);

  if (!clientToken || failed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">
            Checkout unavailable
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Online checkout is not configured for this environment. Please
            contact support if you believe this is an error.
          </p>
          <Link
            href="/dashboard/billing"
            className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Back to billing
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">
          {initialized ? "Opening secure checkout…" : "Loading checkout…"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          You will be redirected to Paddle&apos;s secure checkout. If nothing
          happens, your checkout link may have expired — start again from the
          billing page.
        </p>
        <Link
          href="/dashboard/billing"
          className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Back to billing
        </Link>
      </div>
      <Script
        src="https://cdn.paddle.com/paddle/v2/paddle.js"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
    </main>
  );
}
