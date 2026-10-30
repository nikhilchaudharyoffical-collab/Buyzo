// Single place for the UPI payee details and the payment links.
// Amount and note are baked into the links/QR, the customer never types them.

export const UPI_VPA = "devesh.473@ptyes";
export const UPI_PAYEE_NAME = "BuyDo";
export const UPI_WINDOW_SECONDS = 7 * 60; // payment window, starts when the payment card opens

/** Friendly note shown in the customer's UPI app. Payments are matched by exact amount, not by this note. */
export const UPI_NOTE = "BuyDo Order";
export const upiNote = () => UPI_NOTE;

const query = (amount: number) =>
  [
    `pa=${UPI_VPA}`,
    `pn=${encodeURIComponent(UPI_PAYEE_NAME)}`,
    `am=${amount.toFixed(2)}`,
    "cu=INR",
    `tn=${encodeURIComponent(upiNote())}`,
  ].join("&");

export const upiLinks = (amount: number) => {
  const q = query(amount);
  return {
    /** Standard UPI link: used for the QR code, opens any UPI app. */
    generic: `upi://pay?${q}`,
    phonepe: `phonepe://pay?${q}`,
    gpay: `tez://upi/pay?${q}`,
    paytm: `paytmmp://pay?${q}`,
  };
};
