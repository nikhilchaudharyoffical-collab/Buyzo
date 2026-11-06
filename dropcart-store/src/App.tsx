import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type TouchEvent } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  ImagePlus,
  LayoutDashboard,
  LockKeyhole,
  Gift,
  Menu,
  Package,
  Pencil,
  Percent,
  RotateCcw,
  Plus,
  Printer,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Truck,
  Users,
  X,
} from "lucide-react";
import {
  type AnalyticsSummary,
  type Order,
  type Product,
  type ProductInput,
  type ProductUpdate,
  type OrderInput,
  type OrderStatus,
  OrderInputPaymentMethod,
  OrderStatus as OrderStatusValues,
  useCreateOrder,
  useCreateProduct,
  useDeleteProduct,
  useGetAnalyticsSummary,
  useListOrders,
  useListProducts,
  useTrackAnalyticsEvent,
  useUpdateOrder,
  useUpdateProduct,
  getGetAnalyticsSummaryQueryKey,
  getListOrdersQueryKey,
  getListProductsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { clearPendingUpi, loadPendingUpi, savePendingUpi } from "@/lib/pending-upi";
import { MyOrdersButton } from "@/components/my-orders";
import { ReviewsSection } from "@/components/reviews";
import { useReviews } from "@/lib/reviews";
import { deviceHeaders, notifyOrdersChanged } from "@/lib/device";
import { UPI_WINDOW_SECONDS } from "@/lib/upi";
import { AdminApp as BuyDoAdmin } from "@/admin/AdminApp";
import { ErrorBoundary } from "@/components/error-boundary";
import { UpiPaymentCard } from "@/components/upi-payment-card";
import { PayIcon } from "@/components/pay-icons";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const formatDate = (date: string | Date) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(date));
const getDeliveryDate = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};
const getTrendText = (
  daily: AnalyticsSummary["daily"],
  metric: "visits" | "clicks" | "orders",
) => {
  if (!daily.length) return "Live from DB";
  const latest = daily[daily.length - 1]?.[metric] ?? 0;
  const previous = daily[daily.length - 2]?.[metric] ?? 0;
  if (previous === 0) {
    return latest > 0 ? "Fresh signal" : "No change";
  }
  const delta = ((latest - previous) / previous) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs previous day`;
};

function AppHeader({ onMenu }: { onMenu?: () => void }) {
  void onMenu;
  const [, navigate] = useLocation();
  return (
    <header className="sf-header">
      <div className="sf-header-in">
        <button className="sf-brand" onClick={() => navigate("/")} aria-label="BuyDo home">
          <img className="sf-brand-logo" src={`${import.meta.env.BASE_URL}brand/logo.png`} alt="BuyDo" />
          <span className="sf-brand-india" aria-label="India">INDIA</span>
        </button>
        <nav className="sf-nav" aria-label="Page sections">
          <a href="#details">About the product</a>
          <a href="#delivery">Delivery and returns</a>
        </nav>
        <div className="sf-header-actions">
          <span className="sf-secure"><ShieldCheck size={16} /> Secure checkout</span>
          <MyOrdersButton />
        </div>
      </div>
    </header>
  );
}

/** "Buy 1 Get 1 Free" in English and Hindi, swapping every couple of seconds. Only rendered for products that have the offer. */
function BogoBadge({ className = "", icon = true }: { className?: string; icon?: boolean }) {
  const phrases = ["Buy 1 Get 1 Free", "1 खरीदो, 1 मुफ़्त पाओ"];
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % phrases.length), 2400);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className={`bogo-badge ${className}`}>
      {icon && <Gift size={13} />}
      <span className="bogo-badge-text" key={index}>{phrases[index]}</span>
    </span>
  );
}

/** Bold "BUY 1 GET 1 FREE" sticker (drawn as SVG, so it stays sharp at any size). Placed on the photo and on the Buy button. */
function BogoSticker({ className = "" }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg className={`bogo-sticker ${className}`} viewBox="0 0 220 168" role="img" aria-label="Buy 1 Get 1 Free" focusable="false">
      <defs>
        <linearGradient id={`${uid}r`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff5a3c" /><stop offset="1" stopColor="#d9141e" /></linearGradient>
        <linearGradient id={`${uid}y`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe14a" /><stop offset="1" stopColor="#ffb000" /></linearGradient>
      </defs>
      <g transform="rotate(-7 110 84)">
        {/* burst rays */}
        <g strokeLinecap="round" strokeWidth="7">
          <path d="M16 58 L34 64" stroke="#ffb000" /><path d="M10 80 L30 80" stroke="#ff4b2e" /><path d="M16 102 L34 96" stroke="#ffb000" />
          <path d="M204 52 L188 60" stroke="#ff4b2e" /><path d="M210 76 L192 78" stroke="#ffb000" />
        </g>
        <g className="bogo-sticker-text" strokeLinejoin="round" strokeLinecap="round" paintOrder="stroke fill" fontFamily="Impact, 'Arial Black', 'Helvetica Neue', Arial, sans-serif" fontWeight="900" fontStyle="italic">
          <text x="30" y="62" fontSize="54" textLength="92" lengthAdjust="spacingAndGlyphs" fill={`url(#${uid}r)`} stroke="#fff" strokeWidth="11">BUY</text>
          <text x="134" y="66" fontSize="86" fill={`url(#${uid}r)`} stroke="#fff" strokeWidth="12">1</text>
          <text x="20" y="118" fontSize="62" textLength="108" lengthAdjust="spacingAndGlyphs" fill={`url(#${uid}y)`} stroke="#fff" strokeWidth="12">GET</text>
          <text x="142" y="122" fontSize="86" fill={`url(#${uid}y)`} stroke="#fff" strokeWidth="12">1</text>
        </g>
        <g transform="rotate(-3 110 144)">
          <rect x="28" y="124" width="164" height="38" rx="8" fill={`url(#${uid}r)`} stroke="#fff" strokeWidth="5" />
          <text x="110" y="153" textAnchor="middle" fontSize="33" fontFamily="Impact, 'Arial Black', 'Helvetica Neue', Arial, sans-serif" fontWeight="900" fontStyle="italic" letterSpacing="3" fill="#fff" stroke="#9c0d16" strokeWidth="1.5" paintOrder="stroke fill">FREE</text>
        </g>
      </g>
    </svg>
  );
}

function ProductGallery({ product }: { product: Product }) {
  const [active, setActive] = useState(0);
  const touchStartX = useState({ current: 0 })[0];
  const discountPercent = Math.round((1 - product.price / product.compareAtPrice) * 100);
  const count = product.images.length;

  const goTo = (index: number) => setActive(((index % count) + count) % count);
  const onTouchStart = (event: TouchEvent) => { touchStartX.current = event.touches[0].clientX; };
  const onTouchEnd = (event: TouchEvent) => {
    const deltaX = event.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(deltaX) < 40) return;
    goTo(deltaX < 0 ? active + 1 : active - 1);
  };

  return (
    <div className="sf-gallery">
      {count > 1 && (
        <div className="sf-thumbs" role="tablist" aria-label="Product photos">
          {product.images.map((image, index) => (
            <button key={image + index} type="button" role="tab" aria-selected={active === index} aria-label={`Photo ${index + 1}`} className={active === index ? "active" : ""} onClick={() => setActive(index)}>
              <img src={image} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <div className="sf-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <img src={product.images[active]} alt={`${product.name}, photo ${active + 1} of ${count}`} />
        {discountPercent > 0 && <span className="sf-off">{discountPercent}% off</span>}
        <span className="sf-new">Just dropped</span>
        {product.bogoEnabled && <BogoBadge className="sf-bogo" />}
        {count > 1 && (
          <>
            <button type="button" className="sf-arrow prev" aria-label="Previous photo" onClick={() => goTo(active - 1)}><ChevronLeft size={20} /></button>
            <button type="button" className="sf-arrow next" aria-label="Next photo" onClick={() => goTo(active + 1)}><ChevronRight size={20} /></button>
            <div className="sf-dots" aria-hidden="true">
              {product.images.map((image, index) => <i key={image + index} className={active === index ? "active" : ""} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type InvoiceData = {
  number: string | null;
  date: Date;
  name: string;
  contact: string;
  address: string;
  product: Product;
  quantity: number;
  freeQuantity: number; // Buy 1 Get 1 free units (0 when the product has no offer)
  bogo: boolean; // does this product have the offer
  subtotal: number;
  discount: number;
  upiPercent: number; // the product's UPI discount, for the invoice label
  rounding?: number; // UPI: unique paise taken off so the payment can be recognised
  total: number;
  payment: OrderInputPaymentMethod;
  deliveryDate: string | Date;
};

/** 1.5 -> "1.5", 5 -> "5" */
const fmtPct = (value: number) => String(Math.round(value * 100) / 100);
/** UPI discount for a product: what is really given, and the text shown on the store ("5% off" or "Up to 8% off"). */
const upiOffer = (product: Product) => {
  const actual = product.upiDiscountPercent ?? 0;
  const upTo = product.upiDiscountUpTo != null && product.upiDiscountUpTo > actual ? product.upiDiscountUpTo : null;
  const shown = upTo ?? actual;
  return { actual, active: product.upiEnabled !== false && (actual > 0 || !!upTo), shown, short: `${upTo ? "Up to " : ""}${fmtPct(shown)}% off`, extra: `${upTo ? "Up to " : "Extra "}${fmtPct(shown)}% off` };
};

/** Which payment methods this product accepts, and the words for them. */
const payModes = (product: Product) => {
  const cod = product.codEnabled !== false;
  const upi = product.upiEnabled !== false;
  return { cod, upi, both: cod && upi, label: cod && upi ? "UPI or cash on delivery" : upi ? "UPI only" : "Cash on delivery only" };
};

const formatLongDate = (date: string | Date) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date));

function InvoiceCard({ d }: { d: InvoiceData }) {
  const isUpi = d.payment === OrderInputPaymentMethod.UPI;
  return (
    <div className="invoice invoice-printable">
      <div className="invoice-head">
        <div className="invoice-brand">
          <img className="invoice-logo" src={`${import.meta.env.BASE_URL}brand/logo.png`} alt="BuyDo" />
          <div><small>Order invoice</small></div>
        </div>
        <div className="invoice-meta">
          <span className={`invoice-badge ${d.number ? "placed" : "draft"}`}>{d.number ? "Order placed" : "Draft"}</span>
          <strong>{d.number ? `#${d.number}` : "Invoice preview"}</strong>
          <small>{formatLongDate(d.date)}</small>
        </div>
      </div>
      <div className="invoice-parties">
        <div><span className="field-label">Billed to</span><strong>{d.name}</strong><small>+91 {d.contact}</small></div>
        <div><span className="field-label">Ship to</span><small className="invoice-address">{d.address}</small></div>
      </div>
      <div className="invoice-items">
        <div className="invoice-items-head"><span>Item</span><span>Amount</span></div>
        <div className="invoice-item">
          <img src={d.product.images[0]} alt="" />
          <div><strong>{d.product.name}</strong><small>{money(d.product.price)} each · Qty {d.quantity}</small></div>
          <strong className="amt">{money(d.subtotal)}</strong>
        </div>
        {d.freeQuantity > 0 ? (
          <div className="invoice-item free">
            <img src={d.product.images[0]} alt="" />
            <div><strong>{d.product.name}</strong><small><Gift size={11} /> Buy 1 Get 1 Free · Qty {d.freeQuantity}</small></div>
            <strong className="amt free">FREE</strong>
          </div>
        ) : null}
      </div>
      <div className={`invoice-bogo ${d.freeQuantity > 0 ? "on" : "off"}`}>
        <Gift size={14} />
        {d.freeQuantity > 0
          ? <span><strong>Buy 1 Get 1 Free applied.</strong> You receive {d.quantity + d.freeQuantity} units in total, {d.freeQuantity} of them free.</span>
          : <span><strong>Buy 1 Get 1 Free: not available</strong> on this product.</span>}
      </div>
      <dl className="invoice-totals">
        <div><dt>Subtotal</dt><dd>{money(d.subtotal)}</dd></div>
        {d.discount > 0 && <div className="save"><dt>UPI discount ({fmtPct(d.upiPercent)}%)</dt><dd>−{money(d.discount)}</dd></div>}
        {(d.rounding ?? 0) > 0 && <div className="save"><dt>UPI exact-amount adjustment</dt><dd>−{money(d.rounding!)}</dd></div>}
        <div><dt>Delivery</dt><dd className="free">Free</dd></div>
        <div className="grand"><dt>Total payable</dt><dd>{money(d.total)}</dd></div>
      </dl>
      <div className="invoice-foot">
        <span><Truck size={13} /> Delivery by <strong>{formatDate(d.deliveryDate)}</strong></span>
        <span>{isUpi ? "Payment: UPI" : "Payment: Cash on delivery"}</span>
      </div>
    </div>
  );
}

function PurchaseModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  // If the page was reloaded while a UPI payment was open, pick the unpaid order up again.
  const [restored] = useState(() => loadPendingUpi(product.id));
  const [step, setStep] = useState<"details" | "payment">(restored ? "payment" : "details");
  const [quantity, setQuantity] = useState(restored?.order.quantity ?? 1);
  const [payment, setPayment] = useState<OrderInputPaymentMethod>(restored ? OrderInputPaymentMethod.UPI : product.codEnabled === false ? OrderInputPaymentMethod.UPI : OrderInputPaymentMethod.COD);
  const [name, setName] = useState(restored?.order.customerName ?? "");
  const [contact, setContact] = useState(restored?.order.customerContact ?? "");
  const [address, setAddress] = useState(restored?.order.address ?? "");
  const [confirmed, setConfirmed] = useState<Order | null>(null);
  // UPI: the order is created first (so it has a real order ID for the payment note), then the pay card opens on top.
  const [pendingUpi, setPendingUpi] = useState<Order | null>(restored?.order ?? null);
  const [pendingEndsAt, setPendingEndsAt] = useState<number | undefined>(restored?.endsAt);
  const [upiOpen, setUpiOpen] = useState(!!restored);
  const [expiredNotice, setExpiredNotice] = useState(false);
  const [justSelected, setJustSelected] = useState<OrderInputPaymentMethod | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const createOrder = useCreateOrder({ request: { headers: deviceHeaders() } });
  const trackEvent = useTrackAnalyticsEvent();
  const isUpi = payment === OrderInputPaymentMethod.UPI;
  const subtotal = product.price * quantity;
  const freeQuantity = product.bogoEnabled ? quantity : 0; // Buy 1 Get 1: one free unit for every unit bought
  const maxQuantity = Math.max(1, product.bogoEnabled ? Math.floor(product.stock / 2) : product.stock);
  const offer = upiOffer(product);
  const upiDiscount = isUpi ? Math.round(subtotal * (offer.actual / 100)) : 0; // the percent the admin set for this product
  const total = subtotal - upiDiscount;
  const deliveryDate = getDeliveryDate(isUpi ? 5 : 10);

  useEffect(() => {
    modalRef.current?.scrollTo({ top: 0 });
  }, [step, confirmed]);

  // Plays the "offers unlocked" sequence each time UPI gets selected
  const [unlock, setUnlock] = useState(0);
  const [unlocking, setUnlocking] = useState(false);
  const selectPayment = (method: OrderInputPaymentMethod) => {
    if (method === OrderInputPaymentMethod.UPI && payment !== OrderInputPaymentMethod.UPI) {
      setUnlock((n) => n + 1);
      setUnlocking(true);
      window.setTimeout(() => setUnlocking(false), 2800);
      try { navigator.vibrate?.([14, 40, 22]); } catch { /* not supported */ }
    }
    setPayment(method);
    setJustSelected(method);
    window.setTimeout(() => setJustSelected((current) => (current === method ? null : current)), 650);
  };

  const goToPayment = (event: FormEvent) => {
    event.preventDefault();
    setStep("payment");
  };

  const placeOrder = () => {
    // Re-opening the pay card for the same unpaid UPI order must not create a duplicate order.
    if (
      isUpi && pendingUpi &&
      pendingUpi.quantity === quantity &&
      pendingUpi.customerName === name.trim() &&
      pendingUpi.customerContact === contact.trim() &&
      pendingUpi.address === address.trim()
    ) {
      setUpiOpen(true);
      return;
    }
    createOrder.mutate(
      {
        data: {
          productId: product.id,
          productName: product.name,
          quantity,
          total,
          paymentMethod: payment,
          deliveryDate,
          customerName: name,
          customerContact: contact,
          address,
        } as OrderInput,
      },
      {
        onSuccess: (order) => {
          notifyOrdersChanged();
          trackEvent.mutate({ data: { type: "buy", productId: product.id } });
          if (order.paymentMethod === OrderInputPaymentMethod.UPI) {
            const endsAt = Date.now() + UPI_WINDOW_SECONDS * 1000;
            setPendingUpi(order);
            setPendingEndsAt(endsAt);
            savePendingUpi({ order, endsAt, productId: product.id });
            setUpiOpen(true);
          } else {
            setConfirmed(order);
          }
        },
      },
    );
  };

  const stepLabels = ["Details", "Payment", "Confirmation"];
  const currentStep = confirmed ? 2 : step === "payment" ? 1 : 0;

  // Invoice shown on the payment step is a live preview; after the order it uses the server's final numbers.
  const invoice: InvoiceData = confirmed
    ? {
        number: confirmed.id,
        date: new Date(confirmed.createdAt),
        name: confirmed.customerName,
        contact: confirmed.customerContact,
        address: confirmed.address,
        product,
        quantity: confirmed.quantity,
        freeQuantity: confirmed.freeQuantity ?? 0,
        bogo: (confirmed.freeQuantity ?? 0) > 0,
        subtotal: product.price * confirmed.quantity,
        ...(() => {
          const gross = product.price * confirmed.quantity;
          const isUpiOrder = confirmed.paymentMethod === OrderInputPaymentMethod.UPI;
          const discount = isUpiOrder ? Math.round(gross * (offer.actual / 100)) : Math.max(0, gross - confirmed.total);
          const rounding = Math.max(0, Math.round((gross - discount - confirmed.total) * 100) / 100);
          return { discount, rounding };
        })(),
        total: confirmed.total,
        upiPercent: offer.actual,
        payment: confirmed.paymentMethod as OrderInputPaymentMethod,
        deliveryDate: confirmed.deliveryDate,
      }
    : { number: null, date: new Date(), name, contact, address, product, quantity, freeQuantity, bogo: product.bogoEnabled, subtotal, discount: upiDiscount, upiPercent: offer.actual, total, payment, deliveryDate };
  const confirmedUpi = confirmed?.paymentMethod === OrderInputPaymentMethod.UPI;

  return (
    <>
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={modalRef} className={`purchase-modal ${confirmed ? "is-confirmed" : ""}`}>
        <button className="modal-close" onClick={onClose} aria-label="Close checkout"><X size={18} /></button>

        <ol className="co-steps" aria-label="Checkout progress">
          {stepLabels.map((label, index) => (
            <li key={label} className={index < currentStep ? "done" : index === currentStep ? "active" : ""}>
              <span>{index < currentStep ? <Check size={11} /> : index + 1}</span>{label}
            </li>
          ))}
        </ol>

        {confirmed ? (
          <div className="success-state">
            <div className="success-orbit"><div className="success-check"><Check size={34} /></div></div>
            <span className="eyebrow green">{confirmedUpi ? "Order placed · UPI selected" : "Order confirmed"}</span>
            <h2>You're all set, {confirmed.customerName.split(" ")[0]}.</h2>
            <p>Your order <strong>#{confirmed.id}</strong> has been placed. Keep the invoice below for your records.</p>
            <div className="success-delivery"><Truck size={19} /><span>Arriving by <strong>{formatDate(confirmed.deliveryDate)}</strong></span></div>

            <div className={`confirm-pay ${confirmedUpi ? "upi" : "cod"}`}>
              <span className="confirm-pay-icon">{confirmedUpi ? <PayIcon brand="upi" size={22} /> : <Package size={18} />}</span>
              <div>
                <strong>{confirmedUpi ? "UPI payment" : "Cash on delivery"}</strong>
                <small>{confirmedUpi ? "Payment pending" : "Pay when your order arrives"}</small>
              </div>
              <b>{money(confirmed.total)}</b>
            </div>

            {confirmedUpi && (
              <div className="success-offers">
                <span className="success-offers-title">Offers you unlocked</span>
                {invoice.discount > 0 && <div className="success-offer-row"><Percent size={14} /><span>{fmtPct(offer.actual)}% UPI discount applied</span><strong>−{money(invoice.discount)}</strong></div>}
                <div className="success-offer-row"><Truck size={14} /><span>Fast-track delivery</span><strong>5 days</strong></div>
                <div className="success-offer-row"><Gift size={14} /><span>Cashback credited soon</span><strong>₹50</strong></div>
              </div>
            )}

            <InvoiceCard d={invoice} />

            <div className="confirm-actions">
              <button className="secondary-button" onClick={() => window.print()}><Printer size={16} /> Print / save invoice</button>
              <button className="primary-button" onClick={onClose}>Continue shopping <ArrowRight size={17} /></button>
            </div>
          </div>
        ) : step === "details" ? (
          <>
            <div className="modal-heading">
              <span className="eyebrow">Step 1 of 2</span>
              <h2>Your details</h2>
              <p>No account needed. Just the essentials to get your product to you.</p>
            </div>
            <div className="checkout-product">
              <img src={product.images[0]} alt="" />
              <div><strong>{product.name}</strong><span>{money(product.price)} each</span></div>
              <strong>{money(subtotal)}</strong>
            </div>
            <div className={`checkout-bogo ${product.bogoEnabled ? "on" : "off"}`}>
              <Gift size={15} />
              {product.bogoEnabled
                ? <span><strong>Buy 1 Get 1 Free</strong> · you get {quantity + freeQuantity} units, {freeQuantity} free</span>
                : <span>Buy 1 Get 1 Free is not available on this product</span>}
            </div>
            <form onSubmit={goToPayment}>
              <div className="field-grid">
                <label>Full name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label>
                <label>Phone number<input required type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={contact} onChange={(event) => setContact(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile number" /></label>
              </div>
              <div className="address-heading">
                <span className="field-label">Delivery address</span>
                <span className="address-hint">Enter your full delivery address.</span>
              </div>
              <label className="address-input"><textarea required value={address} onChange={(event) => setAddress(event.target.value)} placeholder="House / flat, street, area, city, state, PIN code" rows={3} /></label>
              <div className="checkout-row">
                <div>
                  <span className="field-label">Quantity</span>
                  <div className="stepper"><button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button><strong>{quantity}</strong><button type="button" onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}>+</button></div>
                </div>
                <div className="delivery-preview"><span className="field-label">Estimated delivery</span><strong>{formatDate(getDeliveryDate(product.codEnabled === false ? 5 : 10))}</strong>{product.codEnabled !== false && product.upiEnabled !== false && <span>Pay by UPI to get it by {formatDate(getDeliveryDate(5))}</span>}</div>
              </div>
              <div className="order-total"><span>Subtotal{freeQuantity > 0 ? ` · ${quantity + freeQuantity} units` : ""}</span><strong>{money(subtotal)}</strong></div>
              <button className="primary-button wide">Continue to payment <ArrowRight size={17} /></button>
            </form>
          </>
        ) : (
          <>
            <div className="modal-heading">
              <span className="eyebrow">Step 2 of 2</span>
              <h2>Review &amp; pay</h2>
              <p>Check your invoice, then choose how you'd like to pay.</p>
            </div>

            <InvoiceCard d={invoice} />

            <span className="field-label pay-label">Payment method</span>
            <div className="payment-options">
              {product.codEnabled !== false && <button type="button" className={`payment-option ${payment === OrderInputPaymentMethod.COD ? "selected" : ""} ${justSelected === OrderInputPaymentMethod.COD ? "just-selected" : ""}`} onClick={() => selectPayment(OrderInputPaymentMethod.COD)}>
                <span className="payment-icon"><Package size={17} /></span><span><strong>Cash on delivery</strong><small>Pay when your order arrives</small></span>{payment === OrderInputPaymentMethod.COD && <Check size={17} className="payment-check" />}
              </button>}
              {product.upiEnabled !== false && <div className={`upi-card-wrap ${payment === OrderInputPaymentMethod.UPI ? "is-unlocked" : "is-locked"} ${unlocking ? "unlocking" : ""}`}>
                <div className="upi-offer-strip">
                  {[
                    ...(offer.active ? [{ Icon: Percent, label: offer.short }] : []),
                    { Icon: Truck, label: "5-day delivery" },
                    { Icon: Gift, label: "₹50 cashback" },
                  ].map(({ Icon, label }, i) => (
                    <span className="upi-offer-chip" key={label} style={{ "--i": i } as CSSProperties}>
                      {payment === OrderInputPaymentMethod.UPI ? <Icon size={11} /> : <LockKeyhole size={10} />} {label}
                    </span>
                  ))}
                </div>
                <button type="button" className={`payment-option upi-option ${payment === OrderInputPaymentMethod.UPI ? "selected" : ""} ${justSelected === OrderInputPaymentMethod.UPI ? "just-selected" : ""}`} onClick={() => selectPayment(OrderInputPaymentMethod.UPI)}>
                  <span className="payment-icon upi"><PayIcon brand="upi" size={24} /></span><span><strong>UPI payment</strong><small>Pay now — unlock the offers above</small></span>{payment === OrderInputPaymentMethod.UPI && <Check size={17} className="payment-check" />}
                </button>
                {unlocking && (
                  <div key={unlock} className="unlock-fx" aria-hidden="true">
                    {Array.from({ length: 18 }, (_, i) => (
                      <i
                        key={i}
                        style={{
                          "--x": `${(i * 37) % 88 + 5}%`,
                          "--s": `${10 + ((i * 5) % 9)}px`,
                          "--dl": `${(i * 0.085).toFixed(2)}s`,
                          "--dur": `${(1.1 + (i % 4) * 0.2).toFixed(2)}s`,
                          "--fall": `${64 + ((i * 13) % 46)}px`,
                          "--rot": `${(i % 2 ? 1 : -1) * (80 + ((i * 29) % 140))}deg`,
                        } as CSSProperties}
                      />
                    ))}
                  </div>
                )}
                {unlocking && (
                  <div key={`t${unlock}`} className="offer-toast"><Sparkles size={13} fill="currentColor" /> {offer.active ? 3 : 2} offers unlocked</div>
                )}
              </div>}
            </div>

            <div className="pay-actions">
              <button type="button" className="secondary-button" onClick={() => { createOrder.reset(); setStep("details"); }} disabled={createOrder.isPending}><ChevronLeft size={16} /> Edit details</button>
              <button type="button" className="primary-button" onClick={placeOrder} disabled={createOrder.isPending}>{createOrder.isPending ? "Placing your order..." : `Place order · ${money(total)}`} <ArrowRight size={17} /></button>
            </div>
            {expiredNotice && <p className="form-error">Your payment window ended and the order was cancelled. Nothing was charged, please place the order again.</p>}
            {createOrder.isError && <p className="form-error">{((createOrder.error as { data?: { error?: string } } | null)?.data?.error) ?? "We couldn't place the order. Please check your details and try again."}</p>}
          </>
        )}
      </div>
    </div>
    {upiOpen && pendingUpi && !confirmed && (
      <UpiPaymentCard
        order={pendingUpi}
        onCancel={() => {
          const order = pendingUpi;
          setUpiOpen(false);
          setPendingUpi(null); // next attempt creates a fresh order (stock was released)
          clearPendingUpi();
          customFetch(`/api/orders/${order.id}/cancel`, {
            method: "POST",
            body: JSON.stringify({ transactionId: order.transactionId }),
          }).catch(() => { /* best effort; admin can still cancel to restock */ });
        }}
        endsAt={pendingEndsAt}
        onExpired={() => {
          setUpiOpen(false);
          setPendingUpi(null);
          clearPendingUpi();
          setExpiredNotice(true);
          notifyOrdersChanged();
        }}
        onPaid={() => { clearPendingUpi(); setUpiOpen(false); setConfirmed(pendingUpi); }}
      />
    )}
    </>
  );
}

function ProductPage() {
  const { data: products, isLoading, isError } = useListProducts();
  // Coming back from the UPI app can reload the page: reopen checkout if a payment is still in progress.
  const [isCheckoutOpen, setCheckoutOpen] = useState(() => !!loadPendingUpi());
  const trackEvent = useTrackAnalyticsEvent();
  const reviewData = useReviews();
  const product = products?.[0];

  // Count one visit per page load. (It used to re-run when the product loaded, so every visit counted twice.)
  const visitSent = useRef(false);
  useEffect(() => {
    if (visitSent.current) return;
    visitSent.current = true;
    trackEvent.mutate({ data: { type: "visit", productId: null } });
  }, []);

  if (isLoading) return <div className="sf-state" role="status"><div className="sf-spinner" /><span>Loading the store</span></div>;
  if (isError || !product) return <div className="sf-state"><Package size={30} /><h2>This product isn't available right now</h2><p>We're updating the store. Please check back in a few minutes.</p></div>;

  const discountPercent = Math.round((1 - product.price / product.compareAtPrice) * 100);
  // With Buy 1 Get 1 every order needs two units, so a single unit left can't be sold.
  const soldOut = product.stock < (product.bogoEnabled ? 2 : 1);
  const openCheckout = () => {
    trackEvent.mutate({ data: { type: "click", productId: product.id } });
    setCheckoutOpen(true);
  };
  const modes = payModes(product);
  const upiArrival = formatLongDate(getDeliveryDate(5));
  const codArrival = formatLongDate(getDeliveryDate(10));

  return (
    <div className="storefront sf">
      <div className="sf-topline">
        <span><Truck size={14} /> Free delivery on every order</span>
        <span><RotateCcw size={14} /> 7-day returns</span>
        {upiOffer(product).active && <span><Percent size={14} /> {upiOffer(product).extra} when you pay with UPI</span>}
      </div>
      <AppHeader />
      <main className="sf-main">
        <nav className="sf-crumbs" aria-label="Breadcrumb"><span>Home</span><ChevronRight size={13} /><span>{product.category}</span><ChevronRight size={13} /><strong>{product.name}</strong></nav>

        <div className="sf-product">
          <ProductGallery product={product} />

          <section className="sf-buy" aria-label="Buy this product">
            <h1>{product.name}</h1>
            {reviewData.summary.count > 0 && (
              <a className="sf-rating" href="#ratings" aria-label={`Rated ${reviewData.summary.average} out of 5 from ${reviewData.summary.count} reviews`}>
                <span className="sf-stars"><Star size={13} fill="currentColor" /> {reviewData.summary.average.toFixed(1)}</span>
                <span>{reviewData.summary.count.toLocaleString("en-IN")} review{reviewData.summary.count === 1 ? "" : "s"}</span>
              </a>
            )}

            <div className="sf-price">
              <strong>{money(product.price)}</strong>
              <s>{money(product.compareAtPrice)}</s>
              {discountPercent > 0 && <span>{discountPercent}% off</span>}
            </div>
            <p className="sf-tax">Inclusive of all taxes</p>

            <div className="sf-offers">
              <h2>Offers</h2>
              <ul>
                {product.bogoEnabled && <li><Gift size={16} /><span><strong>Buy 1, get 1 free</strong> on this product</span></li>}
                {upiOffer(product).active && <li><Percent size={16} /><span><strong>{upiOffer(product).extra}</strong> when you pay with UPI</span></li>}
                <li><Truck size={16} /><span><strong>Free delivery</strong> on every order</span></li>
              </ul>
            </div>

            <ul className="sf-points">
              {product.highlights.map((highlight) => <li key={highlight}><Check size={16} />{highlight}</li>)}
            </ul>

            <div className="sf-ship">
              <Truck size={18} />
              <div>
                {modes.both ? (
                  <><strong>Delivery by {upiArrival} with UPI</strong><span>or by {codArrival} with cash on delivery</span></>
                ) : modes.upi ? (
                  <><strong>Delivery by {upiArrival}</strong><span>Pay by UPI</span></>
                ) : (
                  <><strong>Delivery by {codArrival}</strong><span>Cash on delivery</span></>
                )}
              </div>
            </div>

            <p className={`sf-stock ${product.stock <= 10 ? "low" : ""}`}>
              {soldOut ? "Out of stock" : product.stock <= 10 ? `Only ${product.stock} left in stock` : "In stock"}
            </p>

            {product.bogoEnabled && !soldOut && <BogoBadge className="sf-bogo-strip" />}
            <div className="sf-cta-wrap">
              {product.bogoEnabled && !soldOut && <BogoSticker className="sf-cta-sticker" />}
              <button className="sf-cta" onClick={openCheckout} disabled={soldOut}>{soldOut ? "Out of stock" : "Buy now"}</button>
            </div>
            <p className="sf-cta-note"><LockKeyhole size={13} /> {modes.both ? "Pay by UPI or cash on delivery." : modes.upi ? "Pay by UPI." : "Pay with cash on delivery."} No account needed.</p>

            <ul className="sf-trust">
              <li><Truck size={20} /><span>Free delivery</span></li>
              <li><RotateCcw size={20} /><span>7-day returns</span></li>
              <li><ShieldCheck size={20} /><span>Secure payment</span></li>
            </ul>
          </section>
        </div>

        <section className="sf-section" id="details">
          <h2>About this product</h2>
          <div className="sf-about">
            <p>{product.description}</p>
            <dl className="sf-table">
              <div><dt>Category</dt><dd>{product.category}</dd></div>
              <div><dt>Payment</dt><dd>{modes.label}</dd></div>
              <div><dt>Delivery</dt><dd>{modes.both ? "About 5 days with UPI, about 10 days with cash on delivery" : modes.upi ? "About 5 days" : "About 10 days"}</dd></div>
              <div><dt>Returns</dt><dd>7 days after delivery</dd></div>
            </dl>
          </div>
        </section>

        <section className="sf-section" id="delivery">
          <h2>Delivery, returns and payment</h2>
          <div className="sf-faq">
            <details open>
              <summary>How long does delivery take?<ChevronRight size={16} /></summary>
              <p>{modes.both ? "Orders paid with UPI arrive in about 5 days. Cash on delivery orders arrive in about 10 days." : modes.upi ? "Orders arrive in about 5 days." : "Orders arrive in about 10 days."} Delivery is free on every order.</p>
            </details>
            <details>
              <summary>How do I track, cancel or return an order?<ChevronRight size={16} /></summary>
              <p>Tap My orders at the top of the page on the phone you ordered from. You can see where your order is, cancel it before it ships, or ask for a return within 7 days of delivery. No login needed.</p>
            </details>
            <details>
              <summary>How do refunds work?<ChevronRight size={16} /></summary>
              <p>When you request a return, you share your UPI ID. Once the return is approved, we send the refund to that UPI ID.</p>
            </details>
            <details>
              <summary>Which payment methods can I use?<ChevronRight size={16} /></summary>
              <p>{!modes.upi ? "This product is sold with cash on delivery: pay when your order arrives." : `Pay with any UPI app (PhonePe, Google Pay, Paytm and more)${upiOffer(product).active ? ` and get ${upiOffer(product).extra.toLowerCase()}` : ""}${modes.cod ? ", or choose cash on delivery." : "."}`}</p>
            </details>
          </div>
        </section>

        <ReviewsSection data={reviewData} />
      </main>

      <footer className="sf-footer">
        <div className="sf-footer-in">
          <img className="sf-footer-logo" src={`${import.meta.env.BASE_URL}brand/logo.png`} alt="BuyDo" />
          <p>Free delivery, 7-day returns and secure payments on every order.</p>
          <span className="sf-pay"><PayIcon brand="upi" size={22} /> {modes.both ? "UPI and cash on delivery" : modes.upi ? "UPI payments" : "Cash on delivery"}</span>
          <small>© {new Date().getFullYear()} BuyDo. All rights reserved.</small>
        </div>
      </footer>

      <div className="sf-sticky">
        <div><small>Price</small><strong>{money(product.price)}</strong></div>
        <div className="sf-cta-wrap">
          {product.bogoEnabled && !soldOut && <BogoSticker className="sf-cta-sticker" />}
          <button className="sf-cta" onClick={openCheckout} disabled={soldOut}>{soldOut ? "Out of stock" : "Buy now"}</button>
        </div>
      </div>
      {isCheckoutOpen && <PurchaseModal product={product} onClose={() => setCheckoutOpen(false)} />}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, trend, tone }: { label: string; value: string; icon: typeof Eye; trend: string; tone: string }) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={18} /></div><span>{label}</span><strong>{value}</strong><small className="stat-trend"><ArrowRight size={12} /> {trend}</small></div>;
}

function ProductEditor({ product, onClose }: { product?: Product; onClose: () => void }) {
  const queryClient = useQueryClient();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const [form, setForm] = useState<ProductInput>({
    name: product?.name ?? "",
    category: product?.category ?? "General",
    description: product?.description ?? "",
    price: product?.price ?? 999,
    compareAtPrice: product?.compareAtPrice ?? 1499,
    rating: product?.rating ?? 4.5,
    reviewCount: product?.reviewCount ?? 0,
    stock: product?.stock ?? 20,
    images: product?.images ?? ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=85"],
    highlights: product?.highlights ?? ["Thoughtful everyday design", "Fast delivery", "7-day easy returns"],
  });
  const saving = createProduct.isPending || updateProduct.isPending;
  const updateField = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const updateImage = (index: number, value: string) => {
    setForm((current) => ({
      ...current,
      images: current.images.map((image, imageIndex) => imageIndex === index ? value : image),
    }));
  };
  const addImage = () => setForm((current) => ({ ...current, images: [...current.images, ""] }));
  const removeImage = (index: number) => setForm((current) => ({
    ...current,
    images: current.images.length > 1 ? current.images.filter((_, imageIndex) => imageIndex !== index) : current.images,
  }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const payload: ProductUpdate = { ...form, images: form.images.filter((image) => image.trim().length > 0) };
    const options = { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); onClose(); } };
    if (product) updateProduct.mutate({ productId: product.id, data: payload }, options);
    else createProduct.mutate({ data: { ...form, images: form.images.filter((image) => image.trim().length > 0) } }, options);
  };
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="editor-modal">
        <button className="modal-close" onClick={onClose} aria-label="Close editor"><X size={18} /></button>
        <span className="eyebrow">{product ? "Edit listing" : "New listing"}</span>
        <h2>{product ? "Tune your product." : "Add a new product."}</h2>
        <form onSubmit={submit}>
          <div className="field-grid">
            <label>Product name<input required value={form.name} onChange={(event) => updateField("name", event.target.value)} /></label>
            <label>Category<input required value={form.category} onChange={(event) => updateField("category", event.target.value)} /></label>
            <label>Price<input required type="number" min="0" value={form.price} onChange={(event) => updateField("price", Number(event.target.value))} /></label>
            <label>Compare at<input required type="number" min="0" value={form.compareAtPrice} onChange={(event) => updateField("compareAtPrice", Number(event.target.value))} /></label>
          </div>
          <label>Description<textarea required value={form.description} onChange={(event) => updateField("description", event.target.value)} /></label>
          <div className="field-grid">
            <label>Stock<input required type="number" min="0" value={form.stock} onChange={(event) => updateField("stock", Number(event.target.value))} /></label>
            <label>Rating<input required type="number" min="0" max="5" step="0.1" value={form.rating} onChange={(event) => updateField("rating", Number(event.target.value))} /></label>
          </div>
          <div className="images-editor">
            <div className="images-editor-heading">
              <div><span className="field-label">Product media</span><small>Add multiple image URLs or GIF URLs. The first item is the main gallery image.</small></div>
              <button type="button" className="secondary-button compact" onClick={addImage}><ImagePlus size={15} /> Add image</button>
            </div>
            {form.images.map((image, index) => (
              <div className="image-editor-row" key={`${index}-${image}`}>
                <span className="image-index">{String(index + 1).padStart(2, "0")}</span>
                <input required={index === 0} value={image} onChange={(event) => updateImage(index, event.target.value)} placeholder="https://.../product-image.jpg or .gif" />
                {image && <img src={image} alt="" />}
                <button type="button" className="image-remove" onClick={() => removeImage(index)} disabled={form.images.length === 1} aria-label={`Remove image ${index + 1}`}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <div className="editor-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button className="primary-button" disabled={saving}>{saving ? "Saving..." : "Save listing"} <Check size={16} /></button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [session, setSession] = useState<"loading" | "signed-out" | "signed-in">("loading");

  useEffect(() => {
    fetch("/api/admin/session", { credentials: "same-origin" })
      .then((response) => response.json() as Promise<{ authenticated?: boolean }>)
      .then((result) => setSession(result.authenticated ? "signed-in" : "signed-out"))
      .catch(() => setSession("signed-out"));
  }, []);

  if (session === "loading") return <div className="page-loader"><div className="loader-orb" /><span>Loading secure workspace...</span></div>;
  if (session === "signed-out") return <AdminAuthScreen onLogin={() => setSession("signed-in")} />;
  return <AdminWorkspace onLogout={() => setSession("signed-out")} />;
}

function AdminWorkspace({ onLogout }: { onLogout: () => void }) {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"overview" | "products" | "orders">("overview");
  const [editor, setEditor] = useState<Product | "new" | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const queryClient = useQueryClient();
  const { data: products = [], isLoading: productsLoading } = useListProducts();
  const { data: orders = [], isLoading: ordersLoading } = useListOrders({ query: { queryKey: getListOrdersQueryKey() } });
  const { data: analytics } = useGetAnalyticsSummary({ query: { queryKey: getGetAnalyticsSummaryQueryKey() } });
  const updateOrder = useUpdateOrder();
  const deleteProduct = useDeleteProduct();

  const summary: AnalyticsSummary = analytics ?? { visits: 0, productClicks: 0, orders: 0, revenue: 0, conversionRate: 0, daily: [] };
  const nav = (tab: "overview" | "products" | "orders") => { setActiveTab(tab); setMobileNav(false); };
  const removeProduct = (product: Product) => {
    if (window.confirm(`Remove ${product.name} from the storefront?`)) {
      deleteProduct.mutate({ productId: product.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }) });
    }
  };
  return <div className="admin-shell">
    <aside className={`admin-sidebar ${mobileNav ? "open" : ""}`}>
      <div className="sidebar-brand"><span className="sidebar-logo"><img src={`${import.meta.env.BASE_URL}brand/mark.png`} alt="" /></span><span>BuyDo<span className="brand-dot">.</span></span><button className="icon-button sidebar-close" onClick={() => setMobileNav(false)}><X size={18} /></button></div>
      <div className="workspace-pill"><span className="online-dot" /> Live workspace <ChevronRight size={14} /></div>
      <span className="sidebar-label">Operate</span>
      <nav className="admin-nav"><button className={activeTab === "overview" ? "active" : ""} onClick={() => nav("overview")}><LayoutDashboard size={17} /> Overview</button><button className={activeTab === "products" ? "active" : ""} onClick={() => nav("products")}><Tag size={17} /> Products <span>{products.length}</span></button><button className={activeTab === "orders" ? "active" : ""} onClick={() => nav("orders")}><ShoppingBag size={17} /> Orders <span>{orders.filter((order) => order.status === "Processing").length || ""}</span></button></nav>
      <span className="sidebar-label">Shortcuts</span>
      <button className="sidebar-shortcut" onClick={() => setEditor("new")}><Plus size={16} /> Add product</button>
      <div className="sidebar-bottom"><div className="operator-card"><span className="operator-avatar">AD</span><div><strong>Admin operator</strong><small>Full access</small></div><button onClick={async () => { await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" }); queryClient.clear(); onLogout(); }} aria-label="Sign out"><LockKeyhole size={14} /></button></div><button className="back-store" onClick={() => navigate("/")}><ArrowRight size={15} /> View storefront</button></div>
    </aside>
    <main className="admin-main">
      <header className="admin-topbar"><button className="icon-button admin-menu" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div><span className="eyebrow">Sunday, Sep 20, 2026</span><h1>{activeTab === "overview" ? "Good morning, operator." : activeTab === "products" ? "Product catalog" : "Order operations"}</h1></div><div className="admin-top-actions"><button className="icon-button" onClick={() => { queryClient.invalidateQueries({ queryKey: getGetAnalyticsSummaryQueryKey() }); queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }); }}><RefreshCcw size={17} /></button><span className="live-chip"><span className="online-dot" /> Live</span></div></header>
      {activeTab === "overview" && <div className="dashboard-content"><div className="stats-grid"><StatCard label="Store visits" value={summary.visits.toLocaleString("en-IN")} icon={Users} trend={getTrendText(summary.daily, "visits")} tone="purple" /><StatCard label="Product clicks" value={summary.productClicks.toLocaleString("en-IN")} icon={Eye} trend={getTrendText(summary.daily, "clicks")} tone="blue" /><StatCard label="Orders placed" value={summary.orders.toLocaleString("en-IN")} icon={ShoppingBag} trend={getTrendText(summary.daily, "orders")} tone="orange" /><StatCard label="Gross revenue" value={money(summary.revenue)} icon={BarChart3} trend={summary.daily.length ? "Updated from live data" : "No orders yet"} tone="green" /></div><div className="dashboard-grid"><section className="panel analytics-panel"><div className="panel-heading"><div><span className="eyebrow">Performance pulse</span><h2>Traffic is converting.</h2></div><span className="conversion-badge"><Sparkles size={13} /> {summary.conversionRate}% conversion</span></div><div className="chart"><div className="chart-y"><span>2k</span><span>1k</span><span>0</span></div><div className="chart-area">{(summary.daily.length ? summary.daily : [{ label: "Mon", visits: 0, clicks: 0, orders: 0 }]).map((day) => <div className="chart-col" key={day.label}><div className="bar-track"><span className="bar visits" style={{ height: `${Math.min(100, (day.visits / 2200) * 100)}%` }} /><span className="bar clicks" style={{ height: `${Math.min(100, (day.clicks / 1000) * 100)}%` }} /></div><small>{day.label}</small></div>)}</div></div><div className="chart-legend"><span><i className="legend-dot purple" /> Visits</span><span><i className="legend-dot blue" /> Product clicks</span></div></section><section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">Recent movement</span><h2>Latest orders</h2></div><button className="text-button" onClick={() => setActiveTab("orders")}>See all <ArrowRight size={14} /></button></div>{ordersLoading ? <div className="skeleton-lines" /> : orders.slice(0, 4).map((order) => <div className="activity-row" key={order.id}><span className="activity-avatar">{order.customerName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{order.customerName}</strong><small>{order.productName} · {formatDate(order.createdAt)}</small></div><div className="activity-total"><strong>{money(order.total)}</strong><span className={`status ${order.status.toLowerCase()}`}>{order.status}</span></div></div>)}</section></div><section className="panel attention-panel"><div className="attention-icon"><Clock3 size={19} /></div><div><strong>{orders.filter((order) => order.status === "Processing").length || 0} orders need attention</strong><span>Keep fulfilment moving so customers receive the promised delivery.</span></div><button className="secondary-button" onClick={() => setActiveTab("orders")}>Review orders <ArrowRight size={15} /></button></section></div>}
       {activeTab === "products" && <div className="dashboard-content"><div className="page-toolbar"><div><p className="section-intro">Keep the storefront fresh and make every listing count.</p></div><button className="primary-button" onClick={() => setEditor("new")}><Plus size={17} /> Add product</button></div><section className="panel table-panel"><div className="table-heading"><div className="search-box"><Search size={16} /><input placeholder="Search products" /></div><span>{products.length} live listing{products.length === 1 ? "" : "s"}</span></div><div className="product-table">{productsLoading ? <div className="skeleton-lines large" /> : products.map((product) => <div className="product-row" key={product.id}><div className="product-media-cell"><img src={product.images[0]} alt="" /><span>{product.images.length} media</span></div><div className="product-cell-main"><strong>{product.name}</strong><span>{product.category}</span></div><div className="product-cell"><span className="cell-label">Price</span><strong>{money(product.price)}</strong></div><div className="product-cell"><span className="cell-label">Stock</span><strong className={product.stock < 10 ? "low-stock" : ""}>{product.stock} units</strong></div><div className="product-cell"><span className="cell-label">Rating</span><strong><Star size={13} fill="currentColor" /> {product.rating}</strong></div><div className="row-actions"><button onClick={() => setEditor(product)} aria-label={`Edit ${product.name}`}><Pencil size={15} /></button><button onClick={() => removeProduct(product)} aria-label={`Delete ${product.name}`}><Trash2 size={15} /></button></div></div>)}</div></section></div>}
      {activeTab === "orders" && <div className="dashboard-content"><div className="page-toolbar"><div><p className="section-intro">Track every order from confirmation to doorstep.</p></div><span className="orders-count"><ShoppingBag size={16} /> {orders.length} recent orders</span></div><section className="panel table-panel"><div className="table-heading"><div><span className="eyebrow">All orders</span><h2>Fulfilment queue</h2></div><div className="filter-chip">All statuses <ChevronRight size={14} /></div></div><div className="orders-table">{ordersLoading ? <div className="skeleton-lines large" /> : orders.map((order) => <div className="order-row" key={order.id}><div className="order-id"><strong>#{order.id}</strong><span>{formatDate(order.createdAt)}</span></div><div className="order-customer"><span className="activity-avatar">{order.customerName.slice(0, 2).toUpperCase()}</span><div><strong>{order.customerName}</strong><span>{order.customerContact}</span></div></div><div className="order-product"><strong>{order.productName}</strong><span>Qty {order.quantity} · {order.paymentMethod}</span></div><div className="order-total-cell"><strong>{money(order.total)}</strong><span>Delivery {formatDate(order.deliveryDate)}</span></div><select value={order.status} onChange={(event) => updateOrder.mutate({ orderId: order.id, data: { status: event.target.value as OrderStatus } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }) })} className={`status-select ${order.status.toLowerCase()}`}><option value="Processing">Processing</option><option value="Confirmed">Confirmed</option><option value="Shipped">Shipped</option><option value="Delivered">Delivered</option><option value="Cancelled">Cancelled</option></select></div>)}</div></section></div>}
    </main>
    {editor && <ProductEditor product={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} />}
  </div>;
}

function AdminAuthScreen({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error ?? "Unable to sign in");
      }
      onLogin();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in");
    } finally {
      setPending(false);
    }
  };

  return <div className="admin-auth-screen"><div className="auth-heading"><img className="auth-logo" src={`${import.meta.env.BASE_URL}brand/logo.png`} alt="BuyDo" /><span className="eyebrow">Restricted workspace</span><h1>Operator sign in</h1><p>Use your admin username and password to manage the storefront, orders, and customer signals.</p><form onSubmit={submit} className="admin-login-form"><label>Username<input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Admin username" /></label><label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Admin password" /></label>{error && <span className="form-error">{error}</span>}<button className="primary-button wide" disabled={pending}>{pending ? "Signing in..." : "Sign in"} <ArrowRight size={17} /></button></form><span className="login-foot"><ShieldCheck size={14} /> Protected by BuyDo admin security</span></div></div>;
}

function Router() {
  return <ErrorBoundary><Switch><Route path="/" component={ProductPage} /><Route path="/admin" component={BuyDoAdmin} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

export default function App() {
  useEffect(() => {
    const ping = () => {
      void fetch("/api/healthz", { cache: "no-store" }).catch(() => undefined);
    };

    ping();
    const interval = window.setInterval(ping, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
