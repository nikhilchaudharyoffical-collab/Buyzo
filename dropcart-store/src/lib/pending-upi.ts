import type { Order } from "@workspace/api-client-react";

// A UPI payment happens in another app, and on many phones the browser reloads the store when the customer
// comes back. Keeping the unpaid order here lets the pay card reopen exactly where it was.
const KEY = "buydo.pendingUpi.v1";
const MAX_AGE_MS = 30 * 60_000;

export type PendingUpi = { order: Order; endsAt: number; productId: string };

export const loadPendingUpi = (productId?: string): PendingUpi | null => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as PendingUpi;
    const age = Date.now() - new Date(saved.order.createdAt).getTime();
    if (!saved.order?.id || !saved.order.transactionId || !(age < MAX_AGE_MS) || (productId && saved.productId !== productId)) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return saved;
  } catch {
    return null;
  }
};

export const savePendingUpi = (value: PendingUpi) => {
  try { window.localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* storage unavailable: card just won't survive a reload */ }
};

export const clearPendingUpi = () => {
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
};
