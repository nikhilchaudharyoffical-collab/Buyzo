import { useState, type FormEvent } from "react";
import { Download, RotateCcw, ShieldAlert } from "lucide-react";

type Preview = {
  orders: number; paidOrders: number; openOrders: number; pendingRefunds: number; openReturns: number;
  paymentEvents: number; reviews: number; analyticsDays: number; visits: number; productClicks: number; products: number;
  phrase: string; ticket: string; ticketMinutes: number; live: boolean; history: { at: string; detail: string }[];
};

const when = (value: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

/** Launch-day "start fresh": erases test orders, payments, reviews and visit counters behind several locks. */
export function FreshStart({ request, onDone }: { request: <T>(path: string, init?: RequestInit) => Promise<T>; onDone: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [scope, setScope] = useState({ orders: true, reviews: true, analytics: true, products: false });
  const [backupDone, setBackupDone] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [ackLive, setAckLive] = useState(false);
  const [ackProducts, setAckProducts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const check = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setPreview(await request<Preview>("/api/admin/reset/preview"));
      setBackupDone(false); setPhrase(""); setPassword(""); setAckLive(false); setAckProducts(false);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Could not read the database" });
    } finally {
      setBusy(false);
    }
  };

  const ready = !!preview && backupDone && phrase === preview.phrase && password.length > 0 &&
    (scope.orders || scope.reviews || scope.analytics || scope.products) &&
    (!scope.orders || !preview.live || ackLive) && (!scope.products || ackProducts);

  const run = async (event: FormEvent) => {
    event.preventDefault();
    if (!preview || !ready) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await request<{ erased: { orders: number; paymentEvents: number; reviews: number; analyticsDays: number; products: number } }>("/api/admin/reset/run", {
        method: "POST",
        body: JSON.stringify({ ticket: preview.ticket, scope, phrase, password, backupDone, acknowledgeLive: ackLive, acknowledgeProducts: ackProducts }),
      });
      const e = result.erased;
      setMessage({ ok: true, text: `Done. Erased ${e.orders} orders, ${e.paymentEvents} payment records, ${e.reviews} reviews, ${e.analyticsDays} analytics days${e.products ? `, ${e.products} products` : ""}. The store starts fresh.` });
      setPreview(null);
      onDone();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Reset failed" });
      setPreview(null); // the one-time ticket is spent: check again before retrying
    } finally {
      setBusy(false);
      setPassword("");
    }
  };

  const tick = (key: keyof typeof scope) => (event: { target: { checked: boolean } }) => setScope({ ...scope, [key]: event.target.checked });

  return (
    <section className="bd-fresh" aria-label="Fresh start">
      <div className="bd-fresh-head">
        <span className="bd-fresh-icon"><RotateCcw size={18} /></span>
        <div>
          <span className="bd-overline">LAUNCH TOOL</span>
          <h2>Fresh start</h2>
          <p>Wipe your test orders, payments, reviews and visit numbers before launch. Products and store settings stay unless you choose otherwise. Real data can be erased too, so this is locked in several steps.</p>
        </div>
      </div>

      {!preview ? (
        <button className="bd-button secondary" onClick={check} disabled={busy}>{busy ? "Checking..." : "1. Check what will be erased"}</button>
      ) : (
        <form onSubmit={run} className="bd-fresh-form">
          <div className="bd-fresh-counts">
            <div><span>Orders</span><strong>{preview.orders}</strong></div>
            <div><span>Paid by UPI</span><strong>{preview.paidOrders}</strong></div>
            <div><span>Payment records</span><strong>{preview.paymentEvents}</strong></div>
            <div><span>Reviews</span><strong>{preview.reviews}</strong></div>
            <div><span>Visits counted</span><strong>{preview.visits}</strong></div>
            <div><span>Products</span><strong>{preview.products}</strong></div>
          </div>

          {preview.live && (
            <div className="bd-fresh-warn"><ShieldAlert size={16} /><span><strong>Real work in progress:</strong> {preview.openOrders} open order(s), {preview.pendingRefunds} refund(s) due, {preview.openReturns} return request(s). Finish or note these down first, they will be erased too.</span></div>
          )}

          <fieldset>
            <legend>2. Choose what to erase</legend>
            <label className="bd-check-label"><input type="checkbox" checked={scope.orders} onChange={tick("orders")} />Orders and payment records <small>(also removes reviews, which belong to orders)</small></label>
            <label className="bd-check-label"><input type="checkbox" checked={scope.reviews} onChange={tick("reviews")} />Reviews</label>
            <label className="bd-check-label"><input type="checkbox" checked={scope.analytics} onChange={tick("analytics")} />Visits, clicks and daily analytics</label>
            <label className="bd-check-label danger"><input type="checkbox" checked={scope.products} onChange={tick("products")} />Products too <small>(the store will be empty until you add a product)</small></label>
          </fieldset>

          <div className="bd-fresh-step">
            <strong>3. Download a backup</strong>
            <a className="bd-button secondary compact" href="/api/admin/export/orders.csv" onClick={() => setBackupDone(true)}><Download size={14} /> Orders backup (CSV)</a>
            <small>{backupDone ? "Backup requested. Keep the file safe." : "Required. The next steps unlock after you download it."}</small>
          </div>

          <fieldset disabled={!backupDone}>
            <legend>4. Confirm</legend>
            <label>Type <b>{preview.phrase}</b><input value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" spellCheck={false} /></label>
            <label>Admin password again<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
            {scope.orders && preview.live && <label className="bd-check-label"><input type="checkbox" checked={ackLive} onChange={(event) => setAckLive(event.target.checked)} />I understand open orders, refunds and returns will be erased</label>}
            {scope.products && <label className="bd-check-label"><input type="checkbox" checked={ackProducts} onChange={(event) => setAckProducts(event.target.checked)} />I understand all products will be erased</label>}
          </fieldset>

          <div className="bd-fresh-actions">
            <button type="button" className="bd-button secondary" onClick={() => setPreview(null)} disabled={busy}>Cancel</button>
            <button className="bd-button danger" disabled={!ready || busy}>{busy ? "Erasing..." : "Erase and start fresh"}</button>
          </div>
          <small className="bd-fresh-note">This check is valid for {preview.ticketMinutes} minutes and works once. It cannot be undone.</small>
        </form>
      )}

      {message && <p className={message.ok ? "bd-success" : "bd-error"} role="status">{message.text}</p>}
      {preview?.history.length ? <div className="bd-fresh-history"><strong>Earlier resets</strong>{preview.history.map((item) => <small key={item.at}>{when(item.at)} · {item.detail}</small>)}</div> : null}
    </section>
  );
}
