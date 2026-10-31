// A random secret that stays in this browser. It is what lets "My orders" find the customer's orders
// without a login. Only a hash of it is stored on the server.
const KEY = "buydo.device.v1";
let memory: string | null = null;

const randomId = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

export const getDeviceId = (): string => {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved && /^[a-f0-9]{64}$/.test(saved)) return saved;
    const fresh = randomId();
    window.localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Storage blocked (private mode): the id lasts until the page is closed.
    return (memory ??= randomId());
  }
};

export const deviceHeaders = () => ({ "X-Device-Id": getDeviceId() });

/** Ask the "My orders" button to reload (call after placing, cancelling or returning an order). */
export const ORDERS_CHANGED = "buydo:orders-changed";
export const notifyOrdersChanged = () => window.dispatchEvent(new Event(ORDERS_CHANGED));
