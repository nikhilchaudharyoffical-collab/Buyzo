// Single place for the UPI payee details and the payment links.
// Amount and note are baked into the links/QR, the customer never types them.

export const UPI_VPA = "devesh.473@ptyes";
export const UPI_PAYEE_NAME = "BuyDo";
export const UPI_WINDOW_SECONDS = 7 * 60; // payment window, starts when the payment card opens

/**
 * Note that travels with the payment so the server can match it to the order later.
 * It is the order's transaction ID (e.g. BDK7Q2M9XW4T), not the order ID.
 * Kept short with no spaces on purpose: UPI apps cut long notes (some at ~30 chars) and
 * mangle spaces / URL-encoding, so a short note shows up complete more often.
 */
export const upiNote = (reference: string) => reference;

const query = (reference: string, amount: number) =>
  [
    `pa=${UPI_VPA}`,
    `pn=${encodeURIComponent(UPI_PAYEE_NAME)}`,
    `am=${amount.toFixed(2)}`,
    "cu=INR",
    `tn=${encodeURIComponent(upiNote(reference))}`,
  ].join("&");

export const upiLinks = (reference: string, amount: number) => {
  const q = query(reference, amount);
  return {
    /** Standard UPI link: used for the QR code, opens any UPI app. */
    generic: `upi://pay?${q}`,
    phonepe: `phonepe://pay?${q}`,
    gpay: `tez://upi/pay?${q}`,
    paytm: `paytmmp://pay?${q}`,
  };
};
