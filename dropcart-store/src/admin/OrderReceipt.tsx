import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, Printer, X } from "lucide-react";
import type { Order, OrderStatus } from "@workspace/api-client-react";

const STATUSES: OrderStatus[] = ["Processing", "Confirmed", "Shipped", "Delivered", "Cancelled"];
const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const when = (v: string | Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v));
const day = (v: string | Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(v));
const logoUrl = () => `${import.meta.env.BASE_URL}brand/logo.png`;

const PILL: Record<string, { bg: string; fg: string }> = {
  Processing: { bg: "#fcf6e9", fg: "#956a1e" },
  Confirmed: { bg: "#e8f4ef", fg: "#17705c" },
  Shipped: { bg: "#eff3fa", fg: "#3f6190" },
  Delivered: { bg: "#edf6ee", fg: "#2c754a" },
  Cancelled: { bg: "#fbefed", fg: "#a4443c" },
};

/* ---------- PNG download: the receipt is drawn on a canvas, so no extra library is needed ---------- */

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (ctx.measureText(line).width > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

const FONT = '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif';

function paint(ctx: CanvasRenderingContext2D, order: Order, logo: HTMLImageElement | null, scale: number): number {
  const W = 760;
  const cardX = 24;
  const cardW = W - 48;
  const pad = 38;
  const left = cardX + pad;
  const right = cardX + cardW - pad;
  const inner = right - left;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.textBaseline = "alphabetic";
  const setSpacing = (v: string) => { try { (ctx as unknown as { letterSpacing: string }).letterSpacing = v; } catch { /* older browsers */ } };
  const text = (t: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "left", spacing = "0px") => {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; setSpacing(spacing); ctx.fillText(t, x, y); setSpacing("0px");
  };
  const rrect = (x: number, y: number, w: number, h: number, r: number, fill: string) => {
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); ctx.fillStyle = fill; ctx.fill();
  };
  const dashed = (y: number) => {
    ctx.save(); ctx.strokeStyle = "#cfd8d1"; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
    ctx.beginPath(); ctx.moveTo(cardX + 10, y); ctx.lineTo(cardX + cardW - 10, y); ctx.stroke(); ctx.restore();
  };
  const hair = (y: number) => { ctx.fillStyle = "#e6ebe6"; ctx.fillRect(left, y, inner, 1.5); };

  // First pass fills the page background and card after we know the height, so measure with a dry run
  let y = 24 + 40;
  const body: Array<() => void> = [];
  const add = (fn: () => void) => body.push(fn);

  // header
  const headY = y;
  if (logo) {
    const h = 48;
    const w = (logo.naturalWidth / logo.naturalHeight) * h;
    add(() => ctx.drawImage(logo, left - 4, headY - 6, w, h));
  } else {
    add(() => text("BuyDo.", left, headY + 32, `800 32px ${FONT}`, "#0f3347"));
  }
  add(() => text("RECEIPT", right, headY + 24, `700 12px ${FONT}`, "#6b7a72", "right", "2px"));
  y += 70;

  // title row
  ctx.font = `800 24px ${FONT}`;
  const titleY = y;
  add(() => text(`Order #${order.id}`, left, titleY, `800 22px ${FONT}`, "#17251f"));
  y += 24;
  const dateY = y;
  add(() => text(when(order.createdAt), left, dateY, `500 14px ${FONT}`, "#64756c"));
  const pill = PILL[order.status] ?? PILL.Processing;
  ctx.font = `700 13px ${FONT}`;
  const pw = ctx.measureText(order.status.toUpperCase()).width + 30;
  add(() => {
    rrect(right - pw, dateY - 20, pw, 28, 14, pill.bg);
    text(order.status.toUpperCase(), right - pw / 2, dateY - 1, `800 12px ${FONT}`, pill.fg, "center", "1px");
  });
  y += 30;

  // tear line
  const tearY = y;
  add(() => dashed(tearY));
  y += 34;

  const label = (t: string) => { const ly = y; add(() => text(t, left, ly, `800 11px ${FONT}`, "#7d8b83", "left", "1.6px")); y += 22; };

  label("BILLED TO");
  const nameY = y;
  add(() => text(order.customerName, left, nameY, `700 18px ${FONT}`, "#17251f"));
  y += 24;
  const phoneY = y;
  add(() => text(order.customerContact, left, phoneY, `500 15px ${FONT}`, "#3e5c50"));
  y += 22;
  ctx.font = `400 15px ${FONT}`;
  for (const line of wrap(ctx, order.address, inner)) {
    const ay = y;
    add(() => text(line, left, ay, `400 15px ${FONT}`, "#4b5b53"));
    y += 22;
  }
  y += 12;
  const h1 = y; add(() => hair(h1)); y += 28;

  // items
  const colQty = right - 150;
  const hdrY = y;
  add(() => {
    text("ITEM", left, hdrY, `800 11px ${FONT}`, "#7d8b83", "left", "1.6px");
    text("QTY", colQty, hdrY, `800 11px ${FONT}`, "#7d8b83", "center", "1.6px");
    text("AMOUNT", right, hdrY, `800 11px ${FONT}`, "#7d8b83", "right", "1.6px");
  });
  y += 28;
  ctx.font = `600 16px ${FONT}`;
  const itemLines = wrap(ctx, order.productName, colQty - left - 40);
  const itemY = y;
  add(() => {
    itemLines.forEach((line, i) => text(line, left, itemY + i * 22, `600 16px ${FONT}`, "#17251f"));
    text(String(order.quantity), colQty, itemY, `600 16px ${FONT}`, "#17251f", "center");
    text(money(order.total), right, itemY, `700 16px ${FONT}`, "#17251f", "right");
  });
  y += itemLines.length * 22 + 10;
  const h2 = y; add(() => hair(h2)); y += 28;

  // detail rows
  const row = (k: string, v: string, mono = false) => {
    const ry = y;
    add(() => {
      text(k, left, ry, `500 14px ${FONT}`, "#64756c");
      text(v, right, ry, mono ? `700 15px ui-monospace, "SF Mono", Menlo, Consolas, monospace` : `600 14px ${FONT}`, "#17251f", "right");
    });
    y += 28;
  };
  row("Payment method", order.paymentMethod === "UPI" ? "UPI" : "Cash on delivery");
  if (order.transactionId) row("Transaction ID", order.transactionId, true);
  row("Expected delivery", day(order.deliveryDate));
  y += 4;

  // total
  const boxY = y;
  add(() => {
    rrect(left, boxY, inner, 64, 14, "#edf5f0");
    text("Total", left + 22, boxY + 39, `700 16px ${FONT}`, "#3e5c50");
    text(money(order.total), right - 22, boxY + 41, `800 28px ${FONT}`, "#0e4d3f", "right");
  });
  y += 64 + 34;

  // footer
  const fY = y;
  add(() => {
    text("Thank you for shopping with BuyDo", cardX + cardW / 2, fY, `600 14px ${FONT}`, "#3e5c50", "center");
    text("This is a system generated receipt.", cardX + cardW / 2, fY + 22, `400 12px ${FONT}`, "#8a978f", "center");
  });
  y += 22 + 34;

  const cardH = y - 24;
  const H = y + 24;
  // paint background, card and notches, then content
  ctx.fillStyle = "#e9efe9"; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.shadowColor = "rgba(23,42,34,.16)"; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8;
  rrect(cardX, 24, cardW, cardH, 22, "#ffffff"); ctx.restore();
  ctx.beginPath(); ctx.arc(cardX, tearY, 11, 0, Math.PI * 2); ctx.arc(cardX + cardW, tearY, 11, 0, Math.PI * 2); ctx.fillStyle = "#e9efe9"; ctx.fill();
  body.forEach((fn) => fn());
  return H;
}

export async function downloadReceiptPng(order: Order): Promise<void> {
  try { await document.fonts?.ready; } catch { /* ignore */ }
  let logo: HTMLImageElement | null = null;
  try {
    const img = new Image();
    img.src = logoUrl();
    await img.decode();
    logo = img;
  } catch { logo = null; }
  const scale = 2;
  const probe = document.createElement("canvas").getContext("2d")!;
  const height = paint(probe, order, logo, 1);
  const canvas = document.createElement("canvas");
  canvas.width = 760 * scale;
  canvas.height = height * scale;
  paint(canvas.getContext("2d")!, order, logo, scale);
  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `BuyDo-receipt-${order.id}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
      resolve();
    }, "image/png");
  });
}

/* ---------- the receipt card ---------- */

export function OrderReceipt({ order, onClose, onStatus, pending = false }: {
  order: Order;
  onClose: () => void;
  onStatus?: (variables: { id: string; status: OrderStatus }) => void;
  pending?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const printReceipt = () => {
    const root = document.documentElement;
    root.classList.add("bd-print-receipt");
    const done = () => { root.classList.remove("bd-print-receipt"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
  };
  const download = async () => { setBusy(true); try { await downloadReceiptPng(order); } finally { setBusy(false); } };
  const copyTxn = async () => {
    if (!order.transactionId) return;
    try { await navigator.clipboard.writeText(order.transactionId); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  return createPortal(
    <div className="bd-receipt-layer" role="dialog" aria-modal="true" aria-label={`Receipt for order ${order.id}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bd-receipt-wrap">
        <article className="bd-receipt">
          <header className="bd-receipt-head">
            <img src={logoUrl()} alt="BuyDo" />
            <span className="bd-receipt-tag">RECEIPT</span>
            <div className="bd-receipt-id">
              <strong>Order #{order.id}</strong>
              <small>{when(order.createdAt)}</small>
            </div>
            <span className={`bd-receipt-status ${order.status.toLowerCase()}`}>{order.status}</span>
          </header>

          <section className="bd-receipt-block">
            <span className="bd-receipt-label">BILLED TO</span>
            <strong>{order.customerName}</strong>
            <a href={`tel:${order.customerContact}`}>{order.customerContact}</a>
            <p>{order.address}</p>
          </section>

          <section className="bd-receipt-items">
            <div className="bd-receipt-row head"><span>ITEM</span><span>QTY</span><span>AMOUNT</span></div>
            <div className="bd-receipt-row"><strong>{order.productName}</strong><span>{order.quantity}</span><strong>{money(order.total)}</strong></div>
          </section>

          <dl className="bd-receipt-details">
            <div><dt>Payment method</dt><dd>{order.paymentMethod === "UPI" ? "UPI" : "Cash on delivery"}</dd></div>
            {order.transactionId && (
              <div>
                <dt>Transaction ID</dt>
                <dd className="mono">{order.transactionId}<button type="button" className="bd-receipt-copy" onClick={copyTxn} aria-label="Copy transaction ID">{copied ? <Check size={12} /> : <Copy size={12} />}</button></dd>
              </div>
            )}
            <div><dt>Expected delivery</dt><dd>{day(order.deliveryDate)}</dd></div>
          </dl>

          <div className="bd-receipt-total"><span>Total</span><strong>{money(order.total)}</strong></div>
          <footer className="bd-receipt-foot"><strong>Thank you for shopping with BuyDo</strong><span>This is a system generated receipt.</span></footer>
        </article>

        <div className="bd-receipt-actions">
          {onStatus && (
            <label className="bd-receipt-statusbox">
              <span>Order status</span>
              <select className={`bd-order-status ${order.status.toLowerCase()}`} value={order.status} disabled={pending} onChange={(e) => onStatus({ id: order.id, status: e.target.value as OrderStatus })}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          )}
          <div className="bd-receipt-buttons">
            <button type="button" className="bd-button primary" onClick={download} disabled={busy}><Download size={15} /> {busy ? "Preparing..." : "Download"}</button>
            <button type="button" className="bd-button secondary" onClick={printReceipt}><Printer size={15} /> Print / PDF</button>
            <button type="button" className="bd-button secondary" onClick={onClose}><X size={15} /> Close</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
