"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the server page every few seconds while the webhook is pending. */
export function PaymentStatusPoller({ intervalMs = 3000, maxAttempts = 40 }: { intervalMs?: number; maxAttempts?: number }) {
  const router = useRouter();
  useEffect(() => {
    let attempts = 0;
    const id = window.setInterval(() => {
      attempts += 1;
      if (attempts > maxAttempts) window.clearInterval(id);
      else router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs, maxAttempts]);
  return null;
}
