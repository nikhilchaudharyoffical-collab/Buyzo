import { useEffect, useState, type FormEvent, type TouchEvent } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Clock3,
  CreditCard,
  Eye,
  Heart,
  ImagePlus,
  LayoutDashboard,
  LockKeyhole,
  Gift,
  Menu,
  Package,
  Pencil,
  Percent,
  Plus,
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
  Zap,
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
} from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AdminDashboard as BuyDoAdmin } from "@/admin/AdminApp";
import { ErrorBoundary } from "@/components/error-boundary";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
const formatDate = (date: string | Date) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(date));
const getDeliveryDate = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

function AppHeader({ onMenu }: { onMenu?: () => void }) {
  const [, navigate] = useLocation();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button className="icon-button mobile-menu" onClick={onMenu} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <button className="brand" onClick={() => navigate("/")}>
          <span className="brand-mark"><Sparkles size={17} fill="currentColor" /></span>
          <span>BuyDo<span className="brand-dot">.</span></span>
        </button>
        <div className="topbar-actions">
          <span className="trust-note"><ShieldCheck size={16} /> Secure checkout</span>
          <button className="avatar-button" aria-label="Account"><CircleUserRound size={21} /></button>
        </div>
      </div>
    </header>
  );
}

function Rating({ rating, count }: { rating: number; count?: number }) {
  return (
    <div className="rating-row">
      <span className="rating-pill"><Star size={13} fill="currentColor" /> {rating}</span>
      {count ? <span className="muted-text">{count.toLocaleString("en-IN")} verified reviews</span> : null}
    </div>
  );
}

function BogoBadge({ className = "" }: { className?: string }) {
  const phrases = ["Buy 1 Get 1 Free", "1 खरीदो, 1 मुफ़्त पाओ"];
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((current) => (current + 1) % phrases.length), 2200);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className={`bogo-badge ${className}`}>
      <Sparkles size={12} fill="currentColor" />
      <span className="bogo-badge-text" key={index}>{phrases[index]}</span>
    </span>
  );
}

function ProductGallery({ product }: { product: Product }) {
  const [active, setActive] = useState(0);
  const touchStartX = useState({ current: 0 })[0];
  const discountPercent = Math.round((1 - product.price / product.compareAtPrice) * 100);

  const goTo = (index: number) => {
    const count = product.images.length;
    setActive(((index % count) + count) % count);
  };

  const onTouchStart = (event: TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const deltaX = event.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(deltaX) < 40) return;
    if (deltaX < 0) goTo(active + 1);
    else goTo(active - 1);
  };

  return (
    <div className="gallery-wrap">
      <div className="gallery-main" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <img src={product.images[active]} alt={`${product.name} view ${active + 1}`} />
        {discountPercent > 0 && <span className="discount-sticker">{discountPercent}% OFF</span>}
        <BogoBadge className="gallery-bogo" />
        <span className="gallery-tag"><Zap size={13} fill="currentColor" /> Bestseller</span>
        <button className="gallery-fav" aria-label="Add to wishlist"><Heart size={19} /></button>
        {product.images.length > 1 && (
          <>
            <button type="button" className="gallery-nav prev" aria-label="Previous image" onClick={() => goTo(active - 1)}><ChevronLeft size={18} /></button>
            <button type="button" className="gallery-nav next" aria-label="Next image" onClick={() => goTo(active + 1)}><ChevronRight size={18} /></button>
            <div className="gallery-dots">
              {product.images.map((image, index) => (
                <button key={image} type="button" className={`gallery-dot ${active === index ? "active" : ""}`} aria-label={`Go to image ${index + 1}`} onClick={() => goTo(index)} />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="gallery-thumbs">
        {product.images.map((image, index) => (
          <button key={image} className={`thumb ${active === index ? "active" : ""}`} onClick={() => setActive(index)}>
            <img src={image} alt="" />
          </button>
        ))}
      </div>
      <div className="gallery-caption"><Eye size={14} /> 2,100+ people are viewing this right now</div>
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
  const [quantity, setQuantity] = useState(1);
  const [payment, setPayment] = useState<OrderInputPaymentMethod>(OrderInputPaymentMethod.COD);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [confirmed, setConfirmed] = useState<Order | null>(null);
  const [justSelected, setJustSelected] = useState<OrderInputPaymentMethod | null>(null);
  const createOrder = useCreateOrder();
  const trackEvent = useTrackAnalyticsEvent();
  const subtotal = product.price * quantity;
  const UPI_DISCOUNT_RATE = 0.015; // 1.5% real discount applied when UPI is selected
  const upiDiscount = payment === OrderInputPaymentMethod.UPI ? Math.round(subtotal * UPI_DISCOUNT_RATE) : 0;
  const total = subtotal - upiDiscount;
  const deliveryDate = getDeliveryDate(payment === OrderInputPaymentMethod.UPI ? 5 : 10);

  const selectPayment = (method: OrderInputPaymentMethod) => {
    setPayment(method);
    setJustSelected(method);
    window.setTimeout(() => setJustSelected((current) => (current === method ? null : current)), 650);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
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
          trackEvent.mutate({ data: { type: "buy", productId: product.id } });
          setConfirmed(order);
        },
      },
    );
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`purchase-modal ${confirmed ? "is-confirmed" : ""}`}>
        <button className="modal-close" onClick={onClose} aria-label="Close checkout"><X size={18} /></button>
        {confirmed ? (
          <div className="success-state">
            <div className="success-orbit"><div className="success-check"><Check size={34} /></div></div>
            <span className="eyebrow green">Order secured</span>
            <h2>You're all set, {confirmed.customerName.split(" ")[0]}.</h2>
            <p>Your order <strong>#{confirmed.id}</strong> is confirmed. We'll get it moving right away.</p>
            <div className="success-delivery"><Truck size={19} /><span>Arriving by <strong>{formatDate(confirmed.deliveryDate)}</strong></span></div>
            {confirmed.paymentMethod === OrderInputPaymentMethod.UPI && (
              <div className="success-offers">
                <span className="success-offers-title">Offers you unlocked</span>
                <div className="success-offer-row"><Percent size={14} /><span>1.5% UPI discount applied</span><strong>−{money(upiDiscount)}</strong></div>
                <div className="success-offer-row"><Truck size={14} /><span>Fast-track delivery</span><strong>5 days</strong></div>
                <div className="success-offer-row"><Gift size={14} /><span>Cashback credited soon</span><strong>₹50</strong></div>
              </div>
            )}
            <button className="primary-button wide" onClick={onClose}>Continue shopping <ArrowRight size={17} /></button>
          </div>
        ) : (
          <>
            <div className="modal-heading">
              <span className="eyebrow">Quick checkout</span>
              <h2>Complete your order</h2>
              <p>No account needed. Just the essentials to get your product to you.</p>
            </div>
            <div className="checkout-product">
              <img src={product.images[0]} alt="" />
              <div><strong>{product.name}</strong><span>{money(product.price)} each</span></div>
              <strong>{money(total)}</strong>
            </div>
            <form onSubmit={submit}>
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
                  <div className="stepper"><button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button><strong>{quantity}</strong><button type="button" onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}>+</button></div>
                </div>
                <div className="delivery-preview"><span className="field-label">Estimated delivery</span><strong>{formatDate(deliveryDate)}</strong><span>{payment === OrderInputPaymentMethod.UPI ? "Fast-track delivery" : "Standard delivery"}</span></div>
              </div>
              <span className="field-label">Payment method</span>
              <div className="payment-options">
                <button type="button" className={`payment-option ${payment === OrderInputPaymentMethod.COD ? "selected" : ""} ${justSelected === OrderInputPaymentMethod.COD ? "just-selected" : ""}`} onClick={() => selectPayment(OrderInputPaymentMethod.COD)}>
                  <span className="payment-icon"><Package size={17} /></span><span><strong>Cash on delivery</strong><small>Pay when your order arrives</small></span>{payment === OrderInputPaymentMethod.COD && <Check size={17} className="payment-check" />}
                </button>
                <div className="upi-card-wrap">
                  <div className="upi-offer-strip">
                    <span className="upi-offer-chip"><Percent size={11} /> 10% off</span>
                    <span className="upi-offer-chip"><Truck size={11} /> 5-day delivery</span>
                    <span className="upi-offer-chip"><Gift size={11} /> ₹50 cashback</span>
                  </div>
                  <button type="button" className={`payment-option upi-option ${payment === OrderInputPaymentMethod.UPI ? "selected" : ""} ${justSelected === OrderInputPaymentMethod.UPI ? "just-selected" : ""}`} onClick={() => selectPayment(OrderInputPaymentMethod.UPI)}>
                    <span className="payment-icon upi"><CreditCard size={17} /></span><span><strong>UPI payment</strong><small>Pay now — unlock the offers above</small></span>{payment === OrderInputPaymentMethod.UPI && <Check size={17} className="payment-check" />}
                  </button>
                  {justSelected === OrderInputPaymentMethod.UPI && (
                    <div className="offer-toast"><Sparkles size={13} fill="currentColor" /> Offers unlocked!</div>
                  )}
                </div>
              </div>
              {upiDiscount > 0 && (
                <div className="order-savings">
                  <span>Subtotal</span><strong>{money(subtotal)}</strong>
                  <span className="savings-line">UPI discount</span><strong className="savings-line">−{money(upiDiscount)}</strong>
                </div>
              )}
              <div className="order-total"><span>Total payable</span><strong>{money(total)}</strong></div>
              <button className="primary-button wide" disabled={createOrder.isPending}>{createOrder.isPending ? "Securing your order..." : "Confirm order"} <ArrowRight size={17} /><BogoBadge className="buy-button-bogo" /></button>
              {createOrder.isError && <p className="form-error">{((createOrder.error as { data?: { error?: string } } | null)?.data?.error) ?? "We couldn't place the order. Please check your details and try again."}</p>}
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function ProductPage() {
  const { data: products, isLoading, isError, error } = useListProducts();
  const [isCheckoutOpen, setCheckoutOpen] = useState(false);
  const trackEvent = useTrackAnalyticsEvent();
  const product = products?.[0];

  useEffect(() => {
    trackEvent.mutate({ data: { type: "visit", productId: product?.id ?? null } });
  }, [product?.id]);

  if (isLoading) return <div className="page-loader"><div className="loader-orb" /><span>Preparing your product experience...</span></div>;
  if (isError || !product) return <div className="empty-state"><Package size={30} /><h2>Product unavailable</h2><p>This product is currently being refreshed. Please check back shortly.</p><pre style={{whiteSpace: "pre-wrap", textAlign: "left", background: "#eee", padding: "10px", marginTop: "10px", fontSize: "11px"}}>{"TEMP DEBUG:\n"}isError: {String(isError)}{"\n"}error: {error ? String((error as any).message || error) : "none"}{"\n"}products: {JSON.stringify(products)}</pre></div>;
  
  return (
    <div className="storefront">
      <AppHeader />
      <div className="announcement"><Sparkles size={14} /> Free delivery on every order <span>•</span> Easy 7-day returns</div>
      <main className="product-page">
        <div className="breadcrumbs"><span>Home</span><ChevronRight size={13} /><span>{product.category}</span><ChevronRight size={13} /><strong>{product.name}</strong></div>
        <div className="product-layout">
          <ProductGallery product={product} />
          <section className="product-copy">
            <span className="eyebrow">{product.category} / just dropped</span>
            <h1>{product.name}</h1>
            <p className="product-lede">{product.description}</p>
            <Rating rating={product.rating} count={product.reviewCount} />
            <div className="price-block"><span className="price">{money(product.price)}</span><span className="compare-price">{money(product.compareAtPrice)}</span><span className="save-badge">Save {Math.round((1 - product.price / product.compareAtPrice) * 100)}%</span></div>
            <p className="tax-note">Inclusive of all taxes <span>•</span> Free shipping</p>
            <div className="divider" />
            <div className="feature-list">
              {product.highlights.map((highlight, index) => <div key={highlight} className="feature-item"><span className="feature-number">0{index + 1}</span><span>{highlight}</span></div>)}
            </div>
            <div className="stock-note"><span className="stock-dot" /> Only {product.stock} units left in this batch <span className="stock-progress"><span /></span></div>
            <button className="primary-button buy-button" onClick={() => { trackEvent.mutate({ data: { type: "click", productId: product.id } }); setCheckoutOpen(true); }}>Buy now <ArrowRight size={18} /><BogoBadge className="buy-button-bogo" /></button>
            <div className="promise-grid"><div><Truck size={17} /><span><strong>Arrives by {formatDate(getDeliveryDate(10))}</strong><small>Free standard delivery</small></span></div><div><ShieldCheck size={17} /><span><strong>7-day easy returns</strong><small>No questions asked</small></span></div></div>
          </section>
        </div>
        <section className="story-section">
          <div><span className="eyebrow">Why people love it</span><h2>Designed to keep up with real life.</h2></div>
          <div className="story-quote"><span className="quote-mark">“</span><p>Looks premium, feels lighter than expected, and the battery is genuinely impressive. I stopped reaching for my phone as much.</p><div className="quote-by"><span className="mini-avatar">RK</span><span><strong>Riya Kapoor</strong><small>Verified buyer · 4 days ago</small></span><Rating rating={5} /></div></div>
        </section>
        <section className="review-strip"><div className="review-score"><strong>{product.rating}</strong><div><Rating rating={product.rating} /><span>Based on {product.reviewCount} reviews</span></div></div><div className="review-tags"><span>Feels premium</span><span>Fast delivery</span><span>Great battery</span><span>Worth the price</span></div></section>
      </main>
      <div className="mobile-buy-bar"><div><span>From</span><strong>{money(product.price)}</strong></div><button className="primary-button" onClick={() => setCheckoutOpen(true)}>Buy now <ArrowRight size={17} /><BogoBadge className="buy-button-bogo" /></button></div>
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
      <div className="sidebar-brand"><span className="brand-mark"><Sparkles size={17} fill="currentColor" /></span><span>BuyDo<span className="brand-dot">.</span></span><button className="icon-button sidebar-close" onClick={() => setMobileNav(false)}><X size={18} /></button></div>
      <div className="workspace-pill"><span className="online-dot" /> Live workspace <ChevronRight size={14} /></div>
      <span className="sidebar-label">Operate</span>
      <nav className="admin-nav"><button className={activeTab === "overview" ? "active" : ""} onClick={() => nav("overview")}><LayoutDashboard size={17} /> Overview</button><button className={activeTab === "products" ? "active" : ""} onClick={() => nav("products")}><Tag size={17} /> Products <span>{products.length}</span></button><button className={activeTab === "orders" ? "active" : ""} onClick={() => nav("orders")}><ShoppingBag size={17} /> Orders <span>{orders.filter((order) => order.status === "Processing").length || ""}</span></button></nav>
      <span className="sidebar-label">Shortcuts</span>
      <button className="sidebar-shortcut" onClick={() => setEditor("new")}><Plus size={16} /> Add product</button>
      <div className="sidebar-bottom"><div className="operator-card"><span className="operator-avatar">AD</span><div><strong>Admin operator</strong><small>Full access</small></div><button onClick={async () => { await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" }); queryClient.clear(); onLogout(); }} aria-label="Sign out"><LockKeyhole size={14} /></button></div><button className="back-store" onClick={() => navigate("/")}><ArrowRight size={15} /> View storefront</button></div>
    </aside>
    <main className="admin-main">
      <header className="admin-topbar"><button className="icon-button admin-menu" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div><span className="eyebrow">Sunday, Sep 20, 2026</span><h1>{activeTab === "overview" ? "Good morning, operator." : activeTab === "products" ? "Product catalog" : "Order operations"}</h1></div><div className="admin-top-actions"><button className="icon-button" onClick={() => { queryClient.invalidateQueries({ queryKey: getGetAnalyticsSummaryQueryKey() }); queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }); }}><RefreshCcw size={17} /></button><span className="live-chip"><span className="online-dot" /> Live</span></div></header>
      {activeTab === "overview" && <div className="dashboard-content"><div className="stats-grid"><StatCard label="Store visits" value={summary.visits.toLocaleString("en-IN")} icon={Users} trend="+18.4% vs last week" tone="purple" /><StatCard label="Product clicks" value={summary.productClicks.toLocaleString("en-IN")} icon={Eye} trend="+12.8% vs last week" tone="blue" /><StatCard label="Orders placed" value={summary.orders.toLocaleString("en-IN")} icon={ShoppingBag} trend="+9.6% vs last week" tone="orange" /><StatCard label="Gross revenue" value={money(summary.revenue)} icon={BarChart3} trend="+22.1% vs last week" tone="green" /></div><div className="dashboard-grid"><section className="panel analytics-panel"><div className="panel-heading"><div><span className="eyebrow">Performance pulse</span><h2>Traffic is converting.</h2></div><span className="conversion-badge"><Sparkles size={13} /> {summary.conversionRate}% conversion</span></div><div className="chart"><div className="chart-y"><span>2k</span><span>1k</span><span>0</span></div><div className="chart-area">{(summary.daily.length ? summary.daily : [{ label: "Mon", visits: 0, clicks: 0, orders: 0 }]).map((day) => <div className="chart-col" key={day.label}><div className="bar-track"><span className="bar visits" style={{ height: `${Math.min(100, (day.visits / 2200) * 100)}%` }} /><span className="bar clicks" style={{ height: `${Math.min(100, (day.clicks / 1000) * 100)}%` }} /></div><small>{day.label}</small></div>)}</div></div><div className="chart-legend"><span><i className="legend-dot purple" /> Visits</span><span><i className="legend-dot blue" /> Product clicks</span></div></section><section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">Recent movement</span><h2>Latest orders</h2></div><button className="text-button" onClick={() => setActiveTab("orders")}>See all <ArrowRight size={14} /></button></div>{ordersLoading ? <div className="skeleton-lines" /> : orders.slice(0, 4).map((order) => <div className="activity-row" key={order.id}><span className="activity-avatar">{order.customerName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{order.customerName}</strong><small>{order.productName} · {formatDate(order.createdAt)}</small></div><div className="activity-total"><strong>{money(order.total)}</strong><span className={`status ${order.status.toLowerCase()}`}>{order.status}</span></div></div>)}</section></div><section className="panel attention-panel"><div className="attention-icon"><Clock3 size={19} /></div><div><strong>{orders.filter((order) => order.status === "Processing").length || 0} orders need attention</strong><span>Keep fulfilment moving so customers receive the promised delivery.</span></div><button className="secondary-button" onClick={() => setActiveTab("orders")}>Review orders <ArrowRight size={15} /></button></section></div>}
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

  return <div className="admin-auth-screen"><div className="auth-heading"><span className="brand-mark large"><LockKeyhole size={20} /></span><span className="eyebrow">Restricted workspace</span><h1>Operator sign in</h1><p>Use your admin username and password to manage the storefront, orders, and customer signals.</p><form onSubmit={submit} className="admin-login-form"><label>Username<input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Admin username" /></label><label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Admin password" /></label>{error && <span className="form-error">{error}</span>}<button className="primary-button wide" disabled={pending}>{pending ? "Signing in..." : "Sign in"} <ArrowRight size={17} /></button></form><span className="login-foot"><ShieldCheck size={14} /> Protected by BuyDo admin security</span></div></div>;
}

function Router() {
  return <ErrorBoundary><Switch><Route path="/" component={ProductPage} /><Route path="/admin" component={BuyDoAdmin} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

export default function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
