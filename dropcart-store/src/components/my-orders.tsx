import { useCallback, useEffect, useState } from "react";
import { Camera, Check, PackageCheck, Star, X } from "lucide-react";
import { customFetch, type Order } from "@workspace/api-client-react";
import { deviceHeaders, notifyOrdersChanged, ORDERS_CHANGED } from "@/lib/device";
import { notifyReviewsChanged, resizeAvatar } from "@/lib/reviews";

type MyOrder = Order & { canCancel: boolean; canReturn: boolean; returnWindowDays: number; canReview?: boolean; reviewed?: boolean };

const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const day = (value: string | Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
const validUpi = (value: string) => /^[a-z0-9._-]{2,64}@[a-z][a-z0-9]{1,30}$/i.test(value);
const STEPS = ["Processing", "Confirmed", "Shipped", "Delivered"] as const;

const errorText = (error: unknown) =>
  ((error as { data?: { error?: string } } | null)?.data?.error) ?? "Something went wrong. Please try again.";

function OrderCard({ order, onChanged }: { order: MyOrder; onChanged: () => void }) {
  const [mode, setMode] = useState<"idle" | "cancel" | "return" | "review">("idle");
  const [stars, setStars] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [upiId, setUpiId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const act = async (path: "cancel" | "return" | "review", body?: unknown) => {
    setBusy(true);
    setMessage("");
    try {
      await customFetch(`/api/my/orders/${encodeURIComponent(order.id)}/${path}`, {
        method: "POST",
        headers: deviceHeaders(),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      setMode("idle");
      if (path === "review") notifyReviewsChanged();
      onChanged();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const cancelled = order.status === "Cancelled";
  const stepIndex = STEPS.indexOf(order.status as (typeof STEPS)[number]);
  const isUpi = order.paymentMethod === "UPI";

  return (
    <div className="myo-card">
      <div className="myo-top">
        <div><strong>{order.productName}</strong><small>#{order.id} · {day(order.createdAt)}</small></div>
        <strong>{money(order.total)}</strong>
      </div>

      {cancelled ? (
        <p className="myo-note bad">Order cancelled</p>
      ) : (
        <ol className="myo-steps" aria-label="Order progress">
          {STEPS.map((step, index) => (
            <li key={step} className={index < stepIndex ? "done" : index === stepIndex ? "active" : ""}>
              <span>{index < stepIndex ? <Check size={10} /> : index + 1}</span>{step}
            </li>
          ))}
        </ol>
      )}

      <p className="myo-meta">
        {order.quantity} unit{order.quantity === 1 ? "" : "s"}{(order.freeQuantity ?? 0) > 0 ? ` + ${order.freeQuantity} free` : ""} · {isUpi ? (order.paidAt ? "UPI · Paid" : "UPI · Payment not received") : "Cash on delivery"}
        {!cancelled && order.status !== "Delivered" && <> · Delivery by {day(order.deliveryDate)}</>}
      </p>

      {order.refundStatus === "pending" && <p className="myo-note">Your refund of {money(order.total)} is being processed.</p>}
      {order.refundStatus === "done" && <p className="myo-note good">Refund of {money(order.total)} has been sent.</p>}
      {order.returnStatus === "requested" && <p className="myo-note">Return requested. We'll review it shortly.</p>}
      {order.returnStatus === "approved" && <p className="myo-note good">Return approved. Our team will contact you to arrange pickup.</p>}
      {order.returnStatus === "rejected" && <p className="myo-note bad">Return request was not approved.</p>}

      {message && <p className="form-error">{message}</p>}

      {order.reviewed && <p className="myo-note good">Thanks for your review. It's live on the product page.</p>}

      {mode === "idle" && (order.canCancel || order.canReturn || order.canReview) && (
        <div className="myo-actions">
          {order.canReview && <button type="button" className="primary-button" onClick={() => setMode("review")}>Write a review</button>}
          {order.canCancel && <button type="button" className="secondary-button" onClick={() => setMode("cancel")}>Cancel order</button>}
          {order.canReturn && <button type="button" className="secondary-button" onClick={() => setMode("return")}>Return order</button>}
        </div>
      )}
      {mode === "review" && (
        <div className="myo-confirm">
          <span className="field-label">Your rating</span>
          <div className="myo-starpick" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n === 1 ? "" : "s"}`} className={n <= stars ? "on" : ""} onClick={() => setStars(n)}>
                <Star size={26} fill={n <= stars ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
          <label className="field-label" htmlFor={`rv-${order.id}`}>Your review</label>
          <textarea id={`rv-${order.id}`} value={reviewText} onChange={(event) => setReviewText(event.target.value)} maxLength={600} placeholder="How is the product? Tell other buyers in a few words" />
          <span className="field-label">Your photo (optional)</span>
          <div className="myo-photo">
            {avatar ? <img src={avatar} alt="Your profile photo" /> : <span className="myo-photo-empty"><Camera size={20} /></span>}
            <label className="secondary-button">
              {avatar ? "Change photo" : "Add photo"}
              <input type="file" accept="image/*" hidden onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                try { setAvatar(await resizeAvatar(file)); setMessage(""); } catch (error) { setMessage((error as Error).message); }
              }} />
            </label>
            {avatar && <button type="button" className="myo-link" onClick={() => setAvatar(null)}>Remove</button>}
          </div>
          <small className="myo-hint">Your review shows your first name and last initial, with "Verified buyer".</small>
          <div className="myo-actions">
            <button type="button" className="primary-button" disabled={busy || stars === 0 || reviewText.trim().length < 5} onClick={() => void act("review", { rating: stars, body: reviewText.trim(), avatar })}>{busy ? "Posting..." : "Post review"}</button>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => setMode("idle")}>Back</button>
          </div>
        </div>
      )}
      {mode === "cancel" && (
        <div className="myo-confirm">
          <p>Cancel this order?{order.paidAt ? " Your payment will be refunded." : ""}</p>
          <div className="myo-actions">
            <button type="button" className="primary-button" disabled={busy} onClick={() => void act("cancel")}>{busy ? "Cancelling..." : "Yes, cancel"}</button>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => setMode("idle")}>Keep order</button>
          </div>
        </div>
      )}
      {mode === "return" && (
        <div className="myo-confirm">
          <label className="field-label" htmlFor={`ret-${order.id}`}>Why are you returning it? ({order.returnWindowDays}-day return window)</label>
          <textarea id={`ret-${order.id}`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="Tell us in a few words" />
          <label className="field-label" htmlFor={`upi-${order.id}`}>Your UPI ID for the refund</label>
          <input id={`upi-${order.id}`} value={upiId} onChange={(event) => setUpiId(event.target.value.trim())} maxLength={80} inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="name@bank" aria-invalid={upiId.length > 0 && !validUpi(upiId)} />
          {upiId.length > 0 && !validUpi(upiId) && <small className="myo-hint">Enter it like name@bank, for example rahul@okaxis</small>}
          <small className="myo-hint">We'll send your refund to this UPI ID once the return is approved.</small>
          <div className="myo-actions">
            <button type="button" className="primary-button" disabled={busy || reason.trim().length < 3 || !validUpi(upiId)} onClick={() => void act("return", { reason: reason.trim(), upiId: upiId.toLowerCase() })}>{busy ? "Sending..." : "Request return"}</button>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => setMode("idle")}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Header button + panel. Shows up only when this browser has placed an order before. */
export function MyOrdersButton() {
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrders(await customFetch<MyOrder[]>("/api/my/orders", { headers: deviceHeaders(), cache: "no-store" }));
    } catch {
      /* offline or server asleep: keep whatever we have */
    }
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener(ORDERS_CHANGED, onChange);
    return () => window.removeEventListener(ORDERS_CHANGED, onChange);
  }, [load]);

  if (!orders.length) return null;

  return (
    <>
      <button type="button" className="myo-button" onClick={() => { setOpen(true); void load(); }}>
        <PackageCheck size={16} /> My orders
      </button>
      {open && (
        <div className="modal-backdrop myo-layer" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <div className="purchase-modal myo-modal" role="dialog" aria-modal="true" aria-label="My orders">
            <button className="modal-close" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
            <div className="modal-heading">
              <span className="eyebrow">This device</span>
              <h2>My orders</h2>
              <p>Track, cancel or return your orders here. No login needed.</p>
            </div>
            <div className="myo-list">
              {orders.map((order) => <OrderCard key={order.id} order={order} onChanged={() => { void load(); notifyOrdersChanged(); }} />)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
