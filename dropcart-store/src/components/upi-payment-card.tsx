import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Clock3, RefreshCcw, ShieldCheck, Smartphone } from "lucide-react";
import type { Order } from "@workspace/api-client-react";
import { qrMatrix } from "@/lib/qr";
import { UPI_PAYEE_NAME, UPI_VPA, UPI_WINDOW_SECONDS, upiLinks, upiNote } from "@/lib/upi";

const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const isPhone = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

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
  { key: "phonepe", name: "PhonePe", badge: "Pe", color: "#5f259f" },
  { key: "gpay", name: "Google Pay", badge: "G", color: "#1a73e8" },
  { key: "paytm", name: "Paytm", badge: "Pt", color: "#00a3d9" },
] as const;

export function UpiPaymentCard({
  order,
  onCancel,
  onPaid,
}: {
  order: Order;
  onCancel: () => void;
  onPaid: () => void;
}) {
  // The 7 minute window starts as soon as this card opens, whichever way the customer pays.
  const [endsAt, setEndsAt] = useState(() => Date.now() + UPI_WINDOW_SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());
  const [hint, setHint] = useState("");

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
  const links = useMemo(() => upiLinks(order.id, order.total), [order.id, order.total]);

  const openApp = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPhone()) {
      event.preventDefault();
      setHint("App buttons work on your phone. On this device, scan the QR code with your phone's UPI app.");
    }
  };

  const restart = () => {
    setEndsAt(Date.now() + UPI_WINDOW_SECONDS * 1000);
    setNow(Date.now());
    setHint("");
  };

  return (
    <div className="modal-backdrop upi-layer" role="dialog" aria-modal="true" aria-label="Pay with UPI">
      <div className="upi-card">
        <div className="upi-top">
          <span className="eyebrow">Pay with UPI</span>
          <span className={`upi-timer ${remaining <= 60 ? "low" : ""} ${expired ? "expired" : ""}`}>
            <Clock3 size={13} /> {expired ? "Time up" : `${mm}:${ss}`}
          </span>
        </div>

        <div className="upi-amount">
          <small>Total amount to pay</small>
          <strong>{money(order.total)}</strong>
          <span>Order #{order.id}</span>
        </div>
        <div className="upi-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>

        {expired ? (
          <div className="upi-expired">
            <Clock3 size={26} />
            <strong>Payment window closed</strong>
            <p>We didn't receive your payment in time. You can try again for the same order.</p>
            <button type="button" className="primary-button wide" onClick={restart}><RefreshCcw size={16} /> Try again</button>
          </div>
        ) : (
          <>
            <div className="upi-qr-block">
              <div className="upi-qr"><UpiQr value={links.generic} /></div>
              <p>Scan with any UPI app from another phone</p>
            </div>

            <div className="upi-divider"><span><Smartphone size={12} /> or pay on this phone</span></div>

            <div className="upi-apps">
              {APPS.map((app) => (
                <a key={app.key} className="upi-app" href={links[app.key]} onClick={openApp}>
                  <span className="upi-app-badge" style={{ background: app.color }}>{app.badge}</span>
                  <strong>{app.name}</strong>
                </a>
              ))}
            </div>
            {hint && <p className="upi-hint">{hint}</p>}

            <dl className="upi-details">
              <div><dt>Paying to</dt><dd>{UPI_PAYEE_NAME} · {UPI_VPA}</dd></div>
              <div><dt>Note (auto-filled)</dt><dd>{upiNote(order.id)}</dd></div>
            </dl>
            <p className="upi-secure"><ShieldCheck size={13} /> Amount and note are filled in for you. Please don't change them in your UPI app.</p>

            <div className="upi-wait"><span className="upi-pulse" /> Waiting for your payment...</div>
            <button type="button" className="secondary-button wide" onClick={onPaid}>I've completed the payment</button>
          </>
        )}

        <button type="button" className="upi-cancel" onClick={onCancel}>Cancel payment</button>
      </div>
    </div>
  );
}
