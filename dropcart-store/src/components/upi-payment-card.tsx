import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { Check, Clock3, Copy, Plus, RefreshCcw, Smartphone } from "lucide-react";
import { customFetch, type Order } from "@workspace/api-client-react";
import { qrMatrix } from "@/lib/qr";
import { PayIcon } from "@/components/pay-icons";
import { UPI_PAYEE_NAME, UPI_WINDOW_SECONDS, upiLinks, upiNote } from "@/lib/upi";

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Amount counts up from 0 when the card opens. */
function useCountUp(target: number, ms = 900) {
  const [value, setValue] = useState(() => (reducedMotion() ? target : 0));
  useEffect(() => {
    if (reducedMotion()) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setValue(p < 1 ? Math.round(target * (1 - Math.pow(1 - p, 3)) * 100) / 100 : target);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

const RING_R = 21;
const RING_C = 2 * Math.PI * RING_R;

const money = (value: number) => `₹${value.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
const isPhone = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers/contexts without the async clipboard API
    try {
      const field = document.createElement("textarea");
      field.value = text;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(field);
      return ok;
    } catch {
      return false;
    }
  }
}

function UpiQr({ value }: { value: string }) {
  const { path, size } = useMemo(() => {
    const matrix = qrMatrix(value);
    const quiet = 4;
    let d = "";
    matrix.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (!row[x]) {
          x++;
          continue;
        }
        let end = x;
        while (end < row.length && row[end]) end++;
        d += `M${x + quiet} ${y + quiet}h${end - x}v1h-${end - x}z`;
        x = end;
      }
    });
    return { path: d, size: matrix.length + quiet * 2 };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label="UPI payment QR code">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#15171d" />
    </svg>
  );
}

const APPS = [
  { key: "phonepe", name: "PhonePe" },
  { key: "gpay", name: "Google Pay" },
  { key: "paytm", name: "Paytm" },
] as const;

export function UpiPaymentCard({
  order,
  onCancel,
  onPaid,
  endsAt: initialEndsAt,
}: {
  order: Order;
  /** Set when the card is reopened after a page reload, so the timer keeps running from where it was. */
  endsAt?: number;
  onCancel: () => void;
  onPaid: () => void;
}) {
  // The 7 minute window starts as soon as this card opens, whichever way the customer pays.
  const [endsAt, setEndsAt] = useState(() => initialEndsAt ?? Date.now() + UPI_WINDOW_SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());
  const [hint, setHint] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const shownTotal = useCountUp(order.total);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const expired = remaining === 0;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const progress = (remaining / UPI_WINDOW_SECONDS) * 100;

  // Amount comes from the order the server created, and is fixed inside the links.
  // The note is a friendly fixed text. The payment is recognised by its exact amount, not by the note.
  const links = useMemo(() => upiLinks(order.total), [order.total]);
  const note = upiNote();

  const openApp = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPhone()) {
      event.preventDefault();
      setHint("App buttons work on your phone. On this device, scan the QR code with your phone's UPI app.");
    }
  };

  const copyNote = async () => {
    if (await copyText(note)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  // Short success moment, then hand over to the parent (which shows the order confirmation)
  const markPaid = () => {
    setSubmitted(true);
    window.setTimeout(onPaid, reducedMotion() ? 300 : 1700);
  };

  // The money is confirmed by the server (it sees the Paytm "received" notification). Ask every few seconds.
  const [checking, setChecking] = useState(false);
  const paidRef = useRef(false);
  const checkPaid = async (manual = false) => {
    if (paidRef.current || !order.transactionId) return;
    if (manual) setChecking(true);
    try {
      const result = await customFetch<{ paid: boolean }>(
        `/api/orders/${encodeURIComponent(order.id)}/payment-status?transactionId=${encodeURIComponent(order.transactionId)}`,
      );
      if (result.paid && !paidRef.current) {
        paidRef.current = true;
        markPaid();
      } else if (manual && !result.paid) {
        setHint("We haven't received your payment yet. It usually shows up within a few seconds, please keep this window open.");
      }
    } catch {
      if (manual) setHint("Couldn't check right now. Please try again in a moment.");
    } finally {
      if (manual) setChecking(false);
    }
  };
  useEffect(() => {
    const timer = window.setInterval(() => void checkPaid(), 3000);
    // Browsers pause timers while the customer is in the UPI app: check right away when they come back.
    const onVisible = () => { if (document.visibilityState === "visible") void checkPaid(); };
    document.addEventListener("visibilitychange", onVisible);
    void checkPaid();
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, order.transactionId]);

  const restart = () => {
    setEndsAt(Date.now() + UPI_WINDOW_SECONDS * 1000);
    setNow(Date.now());
    setHint("");
  };

  const rise = (i: number) => ({ "--i": i } as CSSProperties);

  return (
    <div className="modal-backdrop upi-layer" role="dialog" aria-modal="true" aria-label="Pay with UPI">
      <div className="upi-card">
        {submitted ? (
          <div className="upi-done">
            <div className="upi-done-burst" aria-hidden="true">
              {Array.from({ length: 20 }, (_, i) => (
                <i key={i} style={{ "--a": `${(i * 360) / 20}deg`, "--d": `${70 + ((i * 17) % 40)}px`, "--c": i % 4 } as CSSProperties} />
              ))}
            </div>
            <svg className="upi-done-check" viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="28" />
              <path d="M20 33l8 8 17-19" />
            </svg>
            <strong>Thank you!</strong>
            <p>Payment received. Placing your order...</p>
          </div>
        ) : (
          <>
            <div className="upi-top upi-rise" style={rise(0)}>
              <div className="upi-title-block">
                <span className="upi-title"><PayIcon brand="upi" size={22} /> Pay with UPI</span>
                <small>Order #{order.id}</small>
              </div>
              <span className={`upi-timer ${remaining <= 60 ? "low" : ""} ${expired ? "expired" : ""}`}>
                <svg className="upi-ring" viewBox="0 0 52 52" aria-hidden="true">
                  <defs>
                    <linearGradient id="upiRingOk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3ab98f" /><stop offset="1" stopColor="#8a6ff0" /></linearGradient>
                    <linearGradient id="upiRingLow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffb347" /><stop offset="1" stopColor="#f95a43" /></linearGradient>
                  </defs>
                  <circle className="track" cx="26" cy="26" r={RING_R} />
                  <circle
                    className="bar"
                    cx="26"
                    cy="26"
                    r={RING_R}
                    stroke={remaining <= 60 ? "url(#upiRingLow)" : "url(#upiRingOk)"}
                    strokeDasharray={RING_C}
                    strokeDashoffset={RING_C * (1 - remaining / UPI_WINDOW_SECONDS)}
                    transform="rotate(-90 26 26)"
                  />
                </svg>
                <b>{mm}:{ss}</b>
              </span>
            </div>

            <div className="upi-amount upi-rise" style={rise(1)}>
              <small>Total amount to pay</small>
              <strong>{money(shownTotal)}</strong>
            </div>

            {expired ? (
              <div className="upi-expired upi-rise" style={rise(2)}>
                <Clock3 size={26} />
                <strong>Payment window closed</strong>
                <p>We didn't receive your payment in time. You can try again for the same order.</p>
                <button type="button" className="primary-button wide" onClick={restart}><RefreshCcw size={16} /> Try again</button>
              </div>
            ) : (
              <>
                <div className="upi-qr-block upi-rise" style={rise(2)}>
                  <div className="upi-qr">
                    <UpiQr value={links.generic} />
                    <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
                    <span className="upi-scan" aria-hidden="true" />
                  </div>
                  <p>Scan with any UPI app from another phone</p>
                </div>

                <div className="upi-divider upi-rise" style={rise(3)}><span><Smartphone size={12} /> or pay on this phone</span></div>

                <div className="upi-apps upi-rise" style={rise(4)}>
                  {APPS.map((app) => (
                    <a key={app.key} className="upi-app" href={links[app.key]} onClick={openApp}>
                      <span className="upi-app-plate"><PayIcon brand={app.key} size={40} /></span>
                      <strong>{app.name}</strong>
                    </a>
                  ))}
                  <a className="upi-app" href={links.generic} onClick={openApp} aria-label="Choose another UPI app installed on your phone">
                    <span className="upi-app-plate upi-app-plus"><Plus size={22} /></span>
                    <strong>More</strong>
                  </a>
                </div>
                {hint && <p className="upi-hint">{hint}</p>}

                <dl className="upi-details upi-rise" style={rise(5)}>
                  <div><dt>Paying to</dt><dd>{UPI_PAYEE_NAME}</dd></div>
                  <div>
                    <dt>Note</dt>
                    <dd className="upi-note">
                      <span>{note}</span>
                      <button type="button" className="upi-copy" onClick={copyNote} aria-label="Copy note">
                        {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                      </button>
                    </dd>
                  </div>
                </dl>
                <p className="upi-secure">Pay the exact amount shown, down to the paise. It is pre-filled in the app and is how we recognise your payment.</p>

                <div className="upi-wait upi-rise" style={rise(6)}><span className="upi-radar" /> Waiting for your payment...</div>
              </>
            )}

            <div className="upi-actions upi-rise" style={rise(7)}>
              {!expired && <button type="button" className="upi-paid" disabled={checking} onClick={() => void checkPaid(true)}>{checking ? "Checking..." : "I've paid"}</button>}
              <button type="button" className="upi-cancel" onClick={onCancel}>Cancel payment</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
