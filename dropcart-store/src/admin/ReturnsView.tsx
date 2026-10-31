import { useMemo, useState } from "react";
import { Check, CircleDollarSign, Copy, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Order } from "@workspace/api-client-react";

const currency = (amount: number) => `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const when = (value: string | Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
const stamp = (order: Order) => new Date(order.returnRequestedAt ?? order.deliveredAt ?? order.createdAt).getTime();

type Filter = "requests" | "refunds" | "resolved";
type Decision = "approve" | "reject";

/** Orders that need the admin to act on a return or a refund. */
export const countReturnWork = (orders: Order[]) =>
  orders.filter((order) => order.returnStatus === "requested").length + orders.filter((order) => order.refundStatus === "pending").length;

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="bd-copy"
      aria-label={label}
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); setDone(true); window.setTimeout(() => setDone(false), 1600); } catch { /* clipboard blocked */ }
      }}
    >
      {done ? <Check size={12} /> : <Copy size={12} />}{done ? "Copied" : "Copy"}
    </button>
  );
}

/** Two-step button: first tap asks, second tap does it. Prevents a mis-tap on a phone from refunding money. */
function Confirmed({ trigger, question, confirmLabel, tone = "primary", disabled, onConfirm }: {
  trigger: (ask: () => void) => React.ReactNode; question: string; confirmLabel: string; tone?: "primary" | "danger"; disabled?: boolean; onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <>{trigger(() => setAsking(true))}</>;
  return (
    <div className="bd-ask" role="group">
      <p>{question}</p>
      <div>
        <button type="button" className={`bd-button ${tone} compact`} disabled={disabled} onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</button>
        <button type="button" className="bd-button secondary compact" onClick={() => setAsking(false)}>Back</button>
      </div>
    </div>
  );
}

function Steps({ order }: { order: Order }) {
  const items = [
    { label: "Delivered", at: order.deliveredAt, done: true },
    { label: "Return requested", at: order.returnRequestedAt, done: !!order.returnStatus },
    { label: order.returnStatus === "rejected" ? "Rejected" : "Approved", at: null, done: order.returnStatus === "approved" || order.returnStatus === "rejected" },
    { label: "Refunded", at: null, done: order.refundStatus === "done" },
  ].filter((item) => order.returnStatus || item.label === "Delivered");
  if (!order.returnStatus) return null;
  return (
    <ol className="bd-rsteps" aria-label="Return progress">
      {items.map((item) => (
        <li key={item.label} className={item.done ? "done" : ""}>
          <i>{item.done ? <Check size={10} /> : null}</i>
          <span>{item.label}</span>
          {item.at && <small>{when(item.at)}</small>}
        </li>
      ))}
    </ol>
  );
}

function RefundHow({ order }: { order: Order }) {
  return (
    <div className="bd-refund-how">
      <CircleDollarSign size={16} />
      <div>
        <strong>Send {currency(order.total)} to {order.customerName}</strong>
        <span>{order.paymentMethod === "UPI" ? "Paid by UPI" : "Paid cash on delivery"}. Send it back by UPI to {order.customerContact}, then mark it as sent.</span>
      </div>
      <CopyButton value={order.customerContact} label={`Copy ${order.customerName}'s phone number`} />
    </div>
  );
}

function Card({ order, filter, pending, onDecision, onRefund }: {
  order: Order; filter: Filter; pending: boolean; onDecision: (id: string, decision: Decision) => void; onRefund: (id: string) => void;
}) {
  const refundReason = order.returnStatus === "approved" ? "Return approved" : order.status === "Cancelled" ? "Order cancelled after payment" : "Refund";
  const chip =
    order.returnStatus === "requested" ? { text: "Needs review", tone: "warn" }
    : order.refundStatus === "pending" ? { text: "Refund due", tone: "warn" }
    : order.returnStatus === "rejected" ? { text: "Rejected", tone: "bad" }
    : order.refundStatus === "done" ? { text: "Refunded", tone: "ok" }
    : { text: "Closed", tone: "ok" };
  return (
    <article className="bd-rcard">
      <header>
        <div>
          <strong>{order.productName}</strong>
          <small>#{order.id} · {order.quantity} unit{order.quantity === 1 ? "" : "s"}</small>
        </div>
        <span className={`bd-chip ${chip.tone}`}>{chip.text}</span>
      </header>

      <dl className="bd-rmeta">
        <div><dt>Customer</dt><dd>{order.customerName}<small>{order.customerContact}</small></dd></div>
        <div><dt>Amount</dt><dd>{currency(order.total)}<small>{order.paymentMethod === "UPI" ? "UPI" : "Cash on delivery"}</small></dd></div>
        {filter === "refunds" && <div><dt>Why</dt><dd>{refundReason}</dd></div>}
      </dl>

      {order.returnReason && (
        <blockquote className="bd-quote"><span>Customer's reason</span>{order.returnReason}</blockquote>
      )}

      <Steps order={order} />

      {filter === "requests" && (
        <footer>
          <Confirmed
            question={`Reject this return? ${order.customerName} will see that it was not approved.`}
            confirmLabel="Yes, reject"
            tone="danger"
            disabled={pending}
            onConfirm={() => onDecision(order.id, "reject")}
            trigger={(ask) => <button type="button" className="bd-button secondary compact" disabled={pending} onClick={ask}><ThumbsDown size={13} /> Reject</button>}
          />
          <Confirmed
            question={`Approve this return? A refund of ${currency(order.total)} will be added to "Refunds due".`}
            confirmLabel="Yes, approve"
            disabled={pending}
            onConfirm={() => onDecision(order.id, "approve")}
            trigger={(ask) => <button type="button" className="bd-button primary compact" disabled={pending} onClick={ask}><ThumbsUp size={13} /> Approve return</button>}
          />
        </footer>
      )}

      {filter === "refunds" && (
        <>
          <RefundHow order={order} />
          <footer>
            <Confirmed
              question={`Confirm only after ${currency(order.total)} has reached ${order.customerName}.`}
              confirmLabel="Yes, refund sent"
              disabled={pending}
              onConfirm={() => onRefund(order.id)}
              trigger={(ask) => <button type="button" className="bd-button primary compact" disabled={pending} onClick={ask}><Check size={13} /> Mark refund as sent</button>}
            />
          </footer>
        </>
      )}
    </article>
  );
}

export function ReturnsView({ orders, pending, onReturnDecision, onRefundDone }: {
  orders: Order[];
  pending: boolean;
  onReturnDecision: (variables: { id: string; decision: Decision }) => void;
  onRefundDone: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("requests");

  const groups = useMemo(() => {
    const requests = orders.filter((order) => order.returnStatus === "requested");
    const refunds = orders.filter((order) => order.refundStatus === "pending");
    const resolved = orders.filter((order) => order.refundStatus === "done" || order.returnStatus === "rejected" || order.returnStatus === "approved")
      .filter((order) => order.returnStatus !== "requested" && order.refundStatus !== "pending");
    const newest = (list: Order[]) => [...list].sort((a, b) => stamp(b) - stamp(a));
    return { requests: newest(requests), refunds: newest(refunds), resolved: newest(resolved) };
  }, [orders]);

  const refundTotal = groups.refunds.reduce((sum, order) => sum + order.total, 0);
  const tabs: { id: Filter; label: string; count: number; hint?: string }[] = [
    { id: "requests", label: "Requests", count: groups.requests.length },
    { id: "refunds", label: "Refunds due", count: groups.refunds.length, hint: groups.refunds.length ? currency(refundTotal) : undefined },
    { id: "resolved", label: "Resolved", count: groups.resolved.length },
  ];
  const list = groups[filter];
  const empty = {
    requests: "No return requests waiting. New ones appear here when a customer asks for a return.",
    refunds: "No refunds waiting. You're all caught up.",
    resolved: "Nothing resolved yet.",
  }[filter];

  return (
    <div className="bd-content">
      <div className="bd-page-intro"><div><h2>Returns &amp; refunds</h2><p>Review return requests, then send the refund and mark it done. Customers see every step in their My orders.</p></div></div>

      <div className="bd-seg" role="tablist" aria-label="Returns sections">
        {tabs.map((tab) => (
          <button key={tab.id} role="tab" aria-selected={filter === tab.id} className={filter === tab.id ? "active" : ""} onClick={() => setFilter(tab.id)}>
            <span>{tab.label}</span>
            <b className={tab.count && tab.id !== "resolved" ? "alert" : ""}>{tab.count}</b>
            {tab.hint && <small>{tab.hint}</small>}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="bd-empty"><RotateCcw size={22} /><span>{empty}</span></div>
      ) : (
        <div className="bd-rlist">
          {list.map((order) => (
            <Card key={order.id} order={order} filter={filter} pending={pending} onDecision={(id, decision) => onReturnDecision({ id, decision })} onRefund={onRefundDone} />
          ))}
        </div>
      )}
    </div>
  );
}
