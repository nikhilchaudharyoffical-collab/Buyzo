import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Database,
  Download,
  Eye,
  ImagePlus,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Order, OrderStatus, Product, ProductInput } from "@workspace/api-client-react";
import "./AdminApp.css";

type Kpis = {
  revenue: number;
  orders: number;
  units: number;
  aov: number;
  visits: number;
  clicks: number;
  conversion: number;
  clickRate: number;
  cancelRate: number;
  customers: number;
  newCustomers: number;
  repeatRate: number;
};

type Analytics = {
  days: number;
  generatedAt: string;
  today: { revenue: number; orders: number; visits: number; clicks: number; buyers: number; cod: number; upi: number };
  kpis: Kpis;
  previous: Kpis;
  series: { date: string; label: string; visits: number; clicks: number; orders: number; revenue: number }[];
  byStatus: { name: string; count: number }[];
  byPayment: { name: string; count: number; revenue: number }[];
  topProducts: { productId: string; name: string; units: number; revenue: number }[];
  hourly: { hour: number; label: string; orders: number }[];
  weekday: { name: string; orders: number; revenue: number }[];
  topCustomers: { name: string; contact: string; orders: number; spent: number }[];
  funnel: { name: string; value: number }[];
  inventory: { id: string; name: string; stock: number; soldInPeriod: number; perDay: number; daysLeft: number | null }[];
  inventoryValue: number;
  pendingOrders: number;
  bestDay: { label: string; revenue: number; orders: number } | null;
  projection: { next7Revenue: number };
};

type Customer = {
  name: string;
  contact: string;
  address: string;
  addresses: string[];
  orders: number;
  spent: number;
  cancelled: number;
  firstOrder: string;
  lastOrder: string;
  orderIds: string[];
};

type DatabaseOverview = {
  products: number;
  orders: number;
  analyticsDays: number;
  oldestOrder: string | null;
  newestOrder: string | null;
  statuses: { status: string; count: number }[];
  sizes: { name: string; bytes: number }[];
};

type AdminTab = "overview" | "orders" | "customers" | "products" | "data";
type ProductForm = ProductInput;
type ProductNumericField = "price" | "compareAtPrice" | "stock" | "rating" | "reviewCount";
type ProductDraft = Omit<ProductForm, ProductNumericField> & Record<ProductNumericField, string>;

const palette = ["#236b5d", "#edae49", "#4664a8", "#d97054", "#82978b"];
const currency = (amount: number) => `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateTime = (value: string | Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const dateOnly = (value: string | Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
const indiaDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const shiftDate = (day: string, offset: number) => new Date(Date.parse(`${day}T00:00:00.000Z`) + offset * 86_400_000).toISOString().slice(0, 10);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function change(current: number, previous: number) {
  if (!previous) return current ? "New" : "No change";
  const percent = ((current - previous) / Math.abs(previous)) * 100;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function AdminApp() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const queryClient = useQueryClient();
  useEffect(() => {
    let mounted = true;
    const checkSession = () => {
      request<{ authenticated: boolean }>("/api/admin/session")
        .then(({ authenticated: active }) => {
          if (!mounted) return;
          if (!active) queryClient.clear();
          setAuthenticated(active);
        })
        .catch(() => {
          if (mounted) setAuthenticated(false);
        });
    };
    checkSession();
    const interval = window.setInterval(checkSession, 30_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [queryClient]);

  if (authenticated === null) return <div className="bd-admin-loading">Checking admin session...</div>;
  if (!authenticated) return <SignIn onSignedIn={() => setAuthenticated(true)} />;
  return <AdminWorkspace onSignOut={() => setAuthenticated(false)} />;
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await request("/api/admin/login", { method: "POST", body: JSON.stringify({ username, password }) });
      onSignedIn();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="bd-admin-auth">
      <section className="bd-auth-form">
        <a className="bd-admin-brand" href="/">BuyDo<span>.</span></a>
        <span className="bd-overline">Store operations</span>
        <h1>Admin sign in</h1>
        <p>Manage orders, customers, inventory, and store performance.</p>
        <form onSubmit={submit}>
          <label>Username<input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error && <p className="bd-error">{error}</p>}
          <button className="bd-button primary" disabled={pending}>{pending ? "Signing in..." : "Sign in"}<ArrowRight size={16} /></button>
        </form>
      </section>
      <aside className="bd-auth-aside"><span>BUYDO / OPERATIONS</span><strong>Every order,<br />accounted for.</strong><small>Live store data, in one place.</small></aside>
    </main>
  );
}

function AdminWorkspace({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [today] = useState(indiaDay);
  const [rangePreset, setRangePreset] = useState("30");
  const [fromDate, setFromDate] = useState(() => shiftDate(indiaDay(), -29));
  const [toDate, setToDate] = useState(today);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const queryClient = useQueryClient();
  const analytics = useQuery({ queryKey: ["admin", "analytics", fromDate, toDate], queryFn: () => request<Analytics>(`/api/admin/analytics?from=${fromDate}&to=${toDate}`), enabled: fromDate <= toDate && toDate <= today });
  const orders = useQuery({ queryKey: ["admin", "orders"], queryFn: () => request<Order[]>("/api/orders") });
  const customers = useQuery({ queryKey: ["admin", "customers"], queryFn: () => request<Customer[]>("/api/admin/customers") });
  const products = useQuery({ queryKey: ["admin", "products"], queryFn: () => request<Product[]>("/api/products") });
  const database = useQuery({ queryKey: ["admin", "database"], queryFn: () => request<DatabaseOverview>("/api/admin/db/overview") });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin"] });
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) => request<Order>(`/api/orders/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => { refresh(); setNotice("Order status updated."); },
  });
  const deleteOrder = useMutation({
    mutationFn: (id: string) => request(`/api/admin/orders/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => { refresh(); setSelected([]); setNotice("Order deleted."); },
  });
  const bulkDelete = useMutation({
    mutationFn: (ids: string[]) => request<{ deleted: number }>("/api/admin/orders/bulk-delete", { method: "POST", body: JSON.stringify({ ids }) }),
    onSuccess: (result) => { refresh(); setSelected([]); setNotice(`${result.deleted} order(s) deleted.`); },
  });
  const saveProduct = useMutation({
    mutationFn: ({ id, data }: { id?: string; data: ProductForm }) => id
      ? request<Product>(`/api/products/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) })
      : request<Product>("/api/products", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { refresh(); setNotice("Product saved."); },
  });
  const deleteProduct = useMutation({
    mutationFn: (id: string) => request(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => { refresh(); setNotice("Product removed from the catalog."); },
  });
  const purge = useMutation({
    mutationFn: (payload: Record<string, unknown>) => request<{ deleted: number }>("/api/admin/data/purge", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (result) => { refresh(); setNotice(`${result.deleted} record(s) deleted.`); },
  });

  const matchingOrders = useMemo(() => (orders.data ?? []).filter((order) => {
    const needle = search.trim().toLowerCase();
    return !needle || [order.id, order.customerName, order.customerContact, order.productName, order.address].some((value) => value.toLowerCase().includes(needle));
  }), [orders.data, search]);
  const matchingCustomers = useMemo(() => (customers.data ?? []).filter((customer) => [customer.name, customer.contact, customer.address].some((value) => value.toLowerCase().includes(search.trim().toLowerCase()))), [customers.data, search]);

  const logout = async () => {
    await request("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    queryClient.clear();
    onSignOut();
  };

  const selectRange = (value: string) => {
    setRangePreset(value);
    if (value !== "custom") {
      const rangeDays = Number(value);
      setToDate(today);
      setFromDate(shiftDate(today, -(rangeDays - 1)));
    }
  };

  const tabs: { id: AdminTab; label: string; icon: typeof Activity }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "orders", label: "Orders", icon: ShoppingBag },
    { id: "customers", label: "Customers", icon: Users },
    { id: "products", label: "Products", icon: Package },
    { id: "data", label: "Data tools", icon: Database },
  ];

  return (
    <div className="bd-admin">
      <aside className="bd-rail">
        <a className="bd-admin-brand" href="/">BuyDo<span>.</span></a>
        <span className="bd-rail-label">STORE</span>
        <nav>{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => { setTab(id); setSearch(""); }}><Icon size={17} />{label}{id === "orders" && (analytics.data?.pendingOrders ?? 0) > 0 && <b>{analytics.data?.pendingOrders}</b>}</button>)}</nav>
        <div className="bd-rail-foot"><span><i /> Database connected</span><button onClick={logout}><LogOut size={16} /> Sign out</button><a href="/">← View storefront</a></div>
      </aside>
      <main className="bd-main">
        <header className="bd-topbar">
          <div><span className="bd-overline">BUYDO / ADMIN</span><h1>{tabs.find((item) => item.id === tab)?.label}</h1></div>
          <div className="bd-top-actions">
            {tab === "overview" && <>
              <label className="bd-period"><CalendarDays size={15} /><select value={rangePreset} onChange={(event) => selectRange(event.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="custom">Custom range</option></select><ChevronDown size={14} /></label>
              <label className="bd-date-filter"><span>From</span><input type="date" value={fromDate} max={toDate} onChange={(event) => { const value = event.target.value; setRangePreset("custom"); setFromDate(value); if (value > toDate) setToDate(value); }} /><span>To</span><input type="date" value={toDate} min={fromDate} max={today} onChange={(event) => { const value = event.target.value; setRangePreset("custom"); setToDate(value); if (value < fromDate) setFromDate(value); }} /></label>
            </>}
            <button className="bd-icon-button" onClick={refresh} aria-label="Refresh data" title="Refresh data"><RefreshCw size={16} /></button>
            <span className="bd-live"><i /> Live data</span>
          </div>
        </header>
        {notice && <div className="bd-notice"><Check size={15} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
        {tab === "overview" && <Overview data={analytics.data} loading={analytics.isLoading} error={analytics.error} orders={orders.data ?? []} onNavigate={setTab} />}
        {tab === "orders" && <OrdersView orders={matchingOrders} loading={orders.isLoading} error={orders.error} search={search} setSearch={setSearch} selected={selected} setSelected={setSelected} updateStatus={updateStatus.mutate} deleteOrder={deleteOrder.mutate} bulkDelete={bulkDelete.mutate} pending={updateStatus.isPending || deleteOrder.isPending || bulkDelete.isPending} />}
        {tab === "customers" && <CustomersView customers={matchingCustomers} loading={customers.isLoading} error={customers.error} search={search} setSearch={setSearch} />}
        {tab === "products" && <ProductsView products={products.data ?? []} loading={products.isLoading} error={products.error} saveProduct={saveProduct.mutateAsync} deleteProduct={deleteProduct.mutate} pending={saveProduct.isPending || deleteProduct.isPending} />}
        {tab === "data" && <DataTools database={database.data} loading={database.isLoading} error={database.error} purge={purge.mutateAsync} pending={purge.isPending} />}
        <footer className="bd-footer">BuyDo store operations <span>Updated {analytics.data?.generatedAt ? dateTime(analytics.data.generatedAt) : "when data loads"}</span></footer>
      </main>
    </div>
  );
}

function Metric({ label, value, delta, icon: Icon, format = "number" }: { label: string; value: number; delta?: string; icon: typeof Activity; format?: "number" | "money" | "percent" }) {
  const display = format === "money" ? currency(value) : format === "percent" ? `${value.toFixed(1)}%` : value.toLocaleString("en-IN");
  const positive = delta?.startsWith("+") || delta === "New";
  return <article className="bd-metric"><div className="bd-metric-head"><span>{label}</span><Icon size={17} /></div><strong>{display}</strong><small className={positive ? "up" : ""}>{delta ? <>{positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{delta} vs previous period</> : "Live total"}</small></article>;
}

function Panel({ title, eyebrow, children, className = "" }: { title: string; eyebrow?: string; children: React.ReactNode; className?: string }) {
  return <section className={`bd-panel ${className}`}><header><div>{eyebrow && <span className="bd-overline">{eyebrow}</span>}<h2>{title}</h2></div></header>{children}</section>;
}

function Overview({ data, loading, error, orders, onNavigate }: { data?: Analytics; loading: boolean; error: Error | null; orders: Order[]; onNavigate: (tab: AdminTab) => void }) {
  if (loading) return <div className="bd-state">Loading store analytics...</div>;
  if (error || !data) return <div className="bd-state error">Analytics could not be loaded. {error?.message}</div>;
  const k = data.kpis;
  const codOrders = data.byPayment.find((payment) => payment.name === "COD")?.count ?? 0;
  const upiOrders = data.byPayment.find((payment) => payment.name === "UPI")?.count ?? 0;
  return <div className="bd-content">
    <div className="bd-welcome"><div><span className="bd-overline">PERFORMANCE / {data.days} DAYS</span><h2>Your store, as it is.</h2><p>Every figure below is calculated from recorded BuyDo orders and visits.</p></div><div className="bd-projection"><span>7-day order value run-rate</span><strong>{currency(data.projection.next7Revenue)}</strong><small>Selected period daily average × 7</small></div></div>
    <section className="bd-today">
      <div className="bd-section-title"><span className="bd-overline">TODAY / INDIA STANDARD TIME</span><span>{dateOnly(new Date())}</span></div>
      <div className="bd-today-grid">
        <Metric label="Today's order value" value={data.today.revenue} icon={CircleDollarSign} format="money" />
        <Metric label="Orders" value={data.today.orders} icon={ShoppingBag} />
        <Metric label="Visits" value={data.today.visits} icon={Eye} />
        <Metric label="Product clicks" value={data.today.clicks} icon={Activity} />
        <Metric label="Buyers" value={data.today.buyers} icon={Users} />
        <Metric label="COD orders" value={data.today.cod} icon={Package} />
        <Metric label="UPI orders" value={data.today.upi} icon={CircleDollarSign} />
      </div>
    </section>
    <div className="bd-metrics">
      <Metric label="Period order value" value={k.revenue} delta={change(k.revenue, data.previous.revenue)} icon={CircleDollarSign} format="money" />
      <Metric label="Orders" value={k.orders} delta={change(k.orders, data.previous.orders)} icon={ShoppingBag} />
      <Metric label="Visits" value={k.visits} delta={change(k.visits, data.previous.visits)} icon={Eye} />
      <Metric label="Product clicks" value={k.clicks} delta={change(k.clicks, data.previous.clicks)} icon={Activity} />
      <Metric label="Buyers" value={k.customers} delta={change(k.customers, data.previous.customers)} icon={Users} />
      <Metric label="Conversion" value={k.conversion} delta={change(k.conversion, data.previous.conversion)} icon={BarChart3} format="percent" />
      <Metric label="COD orders" value={codOrders} icon={Package} />
      <Metric label="UPI orders" value={upiOrders} icon={CircleDollarSign} />
    </div>
    <p className="bd-data-note">Order value uses non-cancelled order totals. Payment settlement is not recorded by the store yet.</p>
    <div className="bd-charts-row">
      <Panel title="Order value and orders" eyebrow="DAILY TREND" className="bd-chart-panel">
        {data.series.every((point) => point.revenue === 0 && point.orders === 0) ? <EmptyState label="No orders in this period" /> : <div className="bd-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.series} margin={{ top: 12, right: 8, left: 2, bottom: 0 }}><defs><linearGradient id="bd-revenue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#236b5d" stopOpacity={0.23} /><stop offset="95%" stopColor="#236b5d" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e8e9e3" /><XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} /><YAxis yAxisId="revenue" tickLine={false} axisLine={false} width={58} tickFormatter={(value: number) => `₹${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`} /><YAxis yAxisId="orders" orientation="right" tickLine={false} axisLine={false} width={30} allowDecimals={false} /><Tooltip formatter={(value: number, name: string) => [name === "Order value" ? currency(value) : value, name]} labelFormatter={(label) => `Date: ${label}`} /><Legend /><Area yAxisId="revenue" type="monotone" dataKey="revenue" name="Order value" stroke="#236b5d" fill="url(#bd-revenue)" strokeWidth={2.5} /><Area yAxisId="orders" type="monotone" dataKey="orders" name="Orders" stroke="#d97054" fill="transparent" strokeWidth={2} /></AreaChart></ResponsiveContainer></div>}
      </Panel>
      <Panel title="Traffic funnel" eyebrow="VISITS TO PURCHASE" className="bd-funnel-panel">
        <div className="bd-funnel-kpis"><div><strong>{k.clickRate.toFixed(1)}%</strong><span>visit to product click</span></div><div><strong>{k.conversion.toFixed(2)}%</strong><span>visit to order</span></div></div>
        <div className="bd-funnel">{data.funnel.map((step, index) => { const width = data.funnel[0]?.value ? Math.max(8, (step.value / data.funnel[0].value) * 100) : 8; return <div key={step.name}><span>{step.name}<b>{step.value.toLocaleString("en-IN")}</b></span><i style={{ width: `${width}%`, background: palette[index] }} /></div>; })}</div>
      </Panel>
    </div>
    <div className="bd-charts-row bd-traffic-row">
      <Panel title="Visits and product clicks" eyebrow="TRAFFIC TREND" className="bd-chart-panel">
        {data.series.every((point) => point.visits === 0 && point.clicks === 0) ? <EmptyState label="No traffic recorded in this period" /> : <div className="bd-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.series} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e8e9e3" /><XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} /><YAxis tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip formatter={(value: number, name: string) => [value.toLocaleString("en-IN"), name]} labelFormatter={(label) => `Date: ${label}`} /><Legend /><Line type="monotone" dataKey="visits" name="Visits" stroke="#4664a8" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="clicks" name="Product clicks" stroke="#d97054" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>}
      </Panel>
      <Panel title="Payment mix" eyebrow="COD VS UPI" className="bd-chart-panel">
        {data.byPayment.every((payment) => payment.count === 0) ? <EmptyState label="No orders in this period" /> : <div className="bd-weekday-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.byPayment} margin={{ top: 12, right: 8, left: 6, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e8e9e3" /><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis yAxisId="orders" tickLine={false} axisLine={false} allowDecimals={false} /><YAxis yAxisId="revenue" orientation="right" tickLine={false} axisLine={false} tickFormatter={(value: number) => `₹${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`} /><Tooltip formatter={(value: number, name: string) => [name === "Order value" ? currency(value) : value, name]} /><Legend /><Bar yAxisId="orders" dataKey="count" name="Orders" fill="#4664a8" radius={[3, 3, 0, 0]} /><Bar yAxisId="revenue" dataKey="revenue" name="Order value" fill="#edae49" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>}
      </Panel>
    </div>
    <div className="bd-insights-grid">
      <Panel title="Best-selling products" eyebrow="BY REVENUE"><RankedList rows={data.topProducts.map((row) => ({ label: row.name, detail: `${row.units} units`, value: currency(row.revenue) }))} empty="No product sales in this period" /></Panel>
      <Panel title="Order status" eyebrow="FULFILMENT"><div className="bd-status-chart">{data.byStatus.some((item) => item.count) ? <><ResponsiveContainer width="46%" height={160}><PieChart><Pie data={data.byStatus.filter((item) => item.count)} dataKey="count" nameKey="name" innerRadius={44} outerRadius={69} paddingAngle={3}>{data.byStatus.filter((item) => item.count).map((item, index) => <Cell key={item.name} fill={palette[index % palette.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="bd-status-legend">{data.byStatus.map((item, index) => <span key={item.name}><i style={{ background: palette[index % palette.length] }} />{item.name}<b>{item.count}</b></span>)}</div></> : <EmptyState label="No orders recorded" />}</div></Panel>
      <Panel title="Demand by hour" eyebrow="ORDER ACTIVITY"><div className="bd-small-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.hourly} margin={{ top: 6, right: 2, left: -25, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e8e9e3" /><XAxis dataKey="hour" tickLine={false} axisLine={false} tickFormatter={(hour: number) => hour % 6 === 0 ? `${hour}:00` : ""} /><YAxis tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip labelFormatter={(hour) => `${hour}:00`} /><Bar dataKey="orders" name="Orders" fill="#4664a8" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel>
    </div>
    <div className="bd-insights-grid lower">
      <Panel title="Customer and basket health" eyebrow="CUSTOMER ANALYSIS"><div className="bd-stat-lines"><div><span>Average order value</span><strong>{currency(k.aov)}</strong></div><div><span>Customers</span><strong>{k.customers.toLocaleString("en-IN")}</strong></div><div><span>New customers</span><strong>{k.newCustomers.toLocaleString("en-IN")}</strong></div><div><span>Repeat customer rate</span><strong>{k.repeatRate.toFixed(1)}%</strong></div><div><span>Cancelled order rate</span><strong>{k.cancelRate.toFixed(1)}%</strong></div><div><span>Units sold</span><strong>{k.units.toLocaleString("en-IN")}</strong></div></div><button className="bd-inline-link" onClick={() => onNavigate("customers")}>View customer list <ArrowRight size={14} /></button></Panel>
      <Panel title="Inventory watch" eyebrow="STOCK COVER"><div className="bd-stock-list">{data.inventory.slice(0, 5).map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{item.soldInPeriod} sold · {item.stock} in stock</small></span><b className={item.daysLeft !== null && item.daysLeft < 14 ? "warning" : ""}>{item.daysLeft === null ? "No forecast" : `${item.daysLeft} days left`}</b></div>)}</div><div className="bd-stock-foot"><span>Inventory retail value</span><strong>{currency(data.inventoryValue)}</strong></div></Panel>
    </div>
    <div className="bd-insights-grid lower">
      <Panel title="Demand by weekday" eyebrow="ORDER PATTERN"><div className="bd-weekday-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.weekday} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e8e9e3" /><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip formatter={(value: number, name: string) => [name === "Revenue" ? currency(value) : value, name]} /><Legend /><Bar dataKey="orders" name="Orders" fill="#236b5d" radius={[3, 3, 0, 0]} /><Bar dataKey="revenue" name="Revenue" fill="#edae49" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel>
      <Panel title="Top customers" eyebrow="BY NET SPEND"><RankedList rows={data.topCustomers.map((row) => ({ label: row.name, detail: `${row.orders} orders · ${row.contact}`, value: currency(row.spent) }))} empty="No customers in this period" /></Panel>
    </div>
    <div className="bd-last-row"><span><Clock3 size={15} />{data.pendingOrders} orders waiting for processing</span><button className="bd-button secondary" onClick={() => onNavigate("orders")}>Open order queue <ArrowRight size={15} /></button><span className="bd-best-day">{data.bestDay ? `Best day: ${data.bestDay.label} · ${currency(data.bestDay.revenue)}` : "No top revenue day yet"}</span></div>
    <Panel title="Latest orders" eyebrow="RECENT ACTIVITY"><OrderTable rows={orders.slice(0, 5)} compact /></Panel>
  </div>;
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="bd-search"><Search size={16} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function OrdersView({ orders, loading, error, search, setSearch, selected, setSelected, updateStatus, deleteOrder, bulkDelete, pending }: { orders: Order[]; loading: boolean; error: Error | null; search: string; setSearch: (value: string) => void; selected: string[]; setSelected: (value: string[]) => void; updateStatus: (variables: { id: string; status: OrderStatus }) => void; deleteOrder: (id: string) => void; bulkDelete: (ids: string[]) => void; pending: boolean }) {
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  return <div className="bd-content">
    <div className="bd-page-intro"><div><h2>Order fulfilment</h2><p>Customer details and status for every order in the database.</p></div><a className="bd-button secondary" href="/api/admin/export/orders.csv"><Download size={15} /> Export CSV</a></div>
    <div className="bd-list-toolbar"><SearchField value={search} onChange={setSearch} placeholder="Search ID, customer, phone, address..." />{selected.length > 0 && <button className="bd-button danger" disabled={pending} onClick={() => window.confirm(`Delete ${selected.length} selected order(s)? This cannot be undone.`) && bulkDelete(selected)}><Trash2 size={15} />Delete selected ({selected.length})</button>}<span>{orders.length} order{orders.length === 1 ? "" : "s"}</span></div>
    {loading ? <div className="bd-state">Loading orders...</div> : error ? <div className="bd-state error">{error.message}</div> : <OrderTable rows={orders} selected={selected} onToggle={toggle} onStatus={updateStatus} onDelete={(id) => window.confirm("Permanently delete this order?") && deleteOrder(id)} pending={pending} />}
  </div>;
}

function OrderTable({ rows, compact = false, selected = [], onToggle, onStatus, onDelete, pending = false }: { rows: Order[]; compact?: boolean; selected?: string[]; onToggle?: (id: string) => void; onStatus?: (variables: { id: string; status: OrderStatus }) => void; onDelete?: (id: string) => void; pending?: boolean }) {
  if (!rows.length) return <EmptyState label="No orders recorded yet" />;
  return <div className="bd-table-wrap"><table className="bd-table"><thead><tr>{!compact && onToggle && <th><span className="sr-only">Select</span></th>}<th>Order</th><th>Customer</th><th>Product</th><th>Total</th><th>Status</th>{!compact && <th aria-label="Actions" />}</tr></thead><tbody>{rows.map((order) => <tr key={order.id}>
    {!compact && onToggle && <td><input className="bd-check" type="checkbox" checked={selected.includes(order.id)} onChange={() => onToggle(order.id)} aria-label={`Select order ${order.id}`} /></td>}
    <td><strong>#{order.id}</strong><small>{dateTime(order.createdAt)}</small></td>
    <td><strong>{order.customerName}</strong><small>{order.customerContact}</small><details className="bd-address"><summary>Delivery address</summary><span>{order.address}</span></details></td>
    <td><strong>{order.productName}</strong><small>{order.quantity} unit{order.quantity === 1 ? "" : "s"} · {order.paymentMethod}</small></td>
    <td><strong>{currency(order.total)}</strong><small>Delivery {dateOnly(order.deliveryDate)}</small></td>
    <td>{onStatus ? <select className={`bd-order-status ${order.status.toLowerCase()}`} value={order.status} disabled={pending} onChange={(event) => onStatus({ id: order.id, status: event.target.value as OrderStatus })}><option>Processing</option><option>Confirmed</option><option>Shipped</option><option>Delivered</option><option>Cancelled</option></select> : <span className={`bd-status-pill ${order.status.toLowerCase()}`}>{order.status}</span>}</td>
    {!compact && <td>{onDelete && <button className="bd-icon-button subtle-danger" onClick={() => onDelete(order.id)} disabled={pending} aria-label={`Delete order ${order.id}`} title="Delete order"><Trash2 size={15} /></button>}</td>}
  </tr>)}</tbody></table></div>;
}

function CustomersView({ customers, loading, error, search, setSearch }: { customers: Customer[]; loading: boolean; error: Error | null; search: string; setSearch: (value: string) => void }) {
  return <div className="bd-content">
    <div className="bd-page-intro"><div><h2>Customer records</h2><p>Grouped by checkout phone number. Details come directly from submitted orders.</p></div><span className="bd-data-stamp"><Users size={15} /> {customers.length} customers</span></div>
    <div className="bd-list-toolbar"><SearchField value={search} onChange={setSearch} placeholder="Search name, phone, or address..." /><span>{customers.length} matching records</span></div>
    {loading ? <div className="bd-state">Loading customers...</div> : error ? <div className="bd-state error">{error.message}</div> : !customers.length ? <EmptyState label="No customers match this search" /> : <div className="bd-customer-list">{customers.map((customer) => <article className="bd-customer-row" key={customer.contact.toLowerCase()}><div className="bd-customer-main"><span className="bd-customer-avatar">{customer.name.slice(0, 1).toUpperCase()}</span><div><strong>{customer.name}</strong><a href={`tel:${customer.contact}`}>{customer.contact}</a><span>{customer.address}</span></div></div><div className="bd-customer-metric"><small>Orders</small><strong>{customer.orders}</strong></div><div className="bd-customer-metric"><small>Net spend</small><strong>{currency(customer.spent)}</strong></div><div className="bd-customer-metric"><small>Cancelled</small><strong>{customer.cancelled}</strong></div><div className="bd-customer-dates"><span>First order <b>{dateOnly(customer.firstOrder)}</b></span><span>Latest order <b>{dateOnly(customer.lastOrder)}</b></span></div></article>)}</div>}
  </div>;
}

function ProductImagePreview({ src, index }: { src: string; index: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src.trim() || failed) {
    return <div className="bd-image-preview empty"><ImagePlus size={19} /><span>{failed ? "Preview unavailable" : "Live preview"}</span></div>;
  }
  return <img className="bd-image-preview" src={src} alt={`Product image ${index + 1} preview`} onError={() => setFailed(true)} />;
}

function ProductsView({ products, loading, error, saveProduct, deleteProduct, pending }: { products: Product[]; loading: boolean; error: Error | null; saveProduct: (variables: { id?: string; data: ProductForm }) => Promise<Product>; deleteProduct: (id: string) => void; pending: boolean }) {
  const [form, setForm] = useState<ProductDraft | null>(null);
  const [editingId, setEditingId] = useState<string>();
  const [formError, setFormError] = useState("");
  const startEdit = (product?: Product) => {
    setEditingId(product?.id);
    setForm({
      name: product?.name ?? "",
      category: product?.category ?? "General",
      description: product?.description ?? "",
      price: product ? String(product.price) : "",
      compareAtPrice: product ? String(product.compareAtPrice) : "",
      stock: product ? String(product.stock) : "",
      rating: product ? String(product.rating) : "",
      reviewCount: product ? String(product.reviewCount) : "",
      images: product?.images.length ? [...product.images] : [""],
      highlights: product?.highlights.length ? [...product.highlights] : [""],
    });
    setFormError("");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    const images = form.images.map((image) => image.trim()).filter(Boolean);
    if (!images.length) {
      setFormError("Add at least one product image URL.");
      return;
    }
    try {
      await saveProduct({ id: editingId, data: {
        ...form,
        price: Number(form.price),
        compareAtPrice: Number(form.compareAtPrice),
        stock: Number(form.stock),
        rating: Number(form.rating),
        reviewCount: Number(form.reviewCount),
        images,
        highlights: form.highlights.map((item) => item.trim()).filter(Boolean),
      } });
      setForm(null);
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Could not save product");
    }
  };
  const setTextList = (key: "images" | "highlights", value: string) => setForm((current) => current && ({ ...current, [key]: value.split("\n") }));
  const setImage = (index: number, value: string) => setForm((current) => current && ({ ...current, images: current.images.map((image, itemIndex) => itemIndex === index ? value : image) }));
  const addImage = () => setForm((current) => current && ({ ...current, images: [...current.images, ""] }));
  const removeImage = (index: number) => setForm((current) => current && ({ ...current, images: current.images.length > 1 ? current.images.filter((_, itemIndex) => itemIndex !== index) : current.images }));
  return <div className="bd-content">
    <div className="bd-page-intro"><div><h2>Product catalog</h2><p>Catalog data and available stock are managed in the live database.</p></div><button className="bd-button primary" onClick={() => startEdit()}><Plus size={16} /> Add product</button></div>
    {loading ? <div className="bd-state">Loading catalog...</div> : error ? <div className="bd-state error">{error.message}</div> : <div className="bd-product-list">{products.map((product) => <article className="bd-product-row" key={product.id}><img src={product.images[0]} alt="" /><div className="bd-product-info"><strong>{product.name}</strong><small>{product.category} · {product.id}</small></div><div><small>Price</small><strong>{currency(product.price)}</strong></div><div><small>Available</small><strong className={product.stock < 10 ? "warning" : ""}>{product.stock}</strong></div><button className="bd-button secondary compact" onClick={() => startEdit(product)}>Edit</button><button className="bd-icon-button subtle-danger" aria-label={`Delete ${product.name}`} onClick={() => window.confirm(`Remove ${product.name} from the catalog? Existing orders stay in the database.`) && deleteProduct(product.id)} disabled={pending}><Trash2 size={15} /></button></article>)}{!products.length && <EmptyState label="No products in the catalog" />}</div>}
    {form && <div className="bd-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setForm(null)}><section className="bd-product-modal"><header><div><span className="bd-overline">CATALOG</span><h2>{editingId ? "Edit product" : "Add product"}</h2></div><button className="bd-icon-button" onClick={() => setForm(null)} aria-label="Close"><X size={17} /></button></header><form onSubmit={submit}>
      <div className="bd-form-grid"><label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Category<input required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label><label>Price<input required type="number" min="0" step="0.01" placeholder="e.g. 1299" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label><label>Compare-at price<input required type="number" min="0" step="0.01" placeholder="e.g. 1999" value={form.compareAtPrice} onChange={(event) => setForm({ ...form, compareAtPrice: event.target.value })} /></label><label>Available stock<input required type="number" min="0" step="1" placeholder="e.g. 25" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} /></label><label>Rating<input required type="number" min="0" max="5" step="0.1" placeholder="0 to 5" value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })} /></label><label>Review count<input required type="number" min="0" step="1" placeholder="e.g. 0" value={form.reviewCount} onChange={(event) => setForm({ ...form, reviewCount: event.target.value })} /></label></div>
      <label>Description<textarea required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      <section className="bd-image-editor"><header><div><strong>Product images</strong><small>Paste an image URL to preview it. Each image has its own row.</small></div><button type="button" className="bd-button secondary compact" onClick={addImage}><ImagePlus size={14} /> Add image</button></header>{form.images.map((image, index) => <div className="bd-image-row" key={`image-${index}`}><ProductImagePreview src={image} index={index} /><label><span>Image {index + 1} URL</span><input type="url" value={image} onChange={(event) => setImage(index, event.target.value)} placeholder="https://example.com/product.jpg" /></label><button type="button" className="bd-icon-button subtle-danger" onClick={() => removeImage(index)} disabled={form.images.length === 1} aria-label={`Remove image ${index + 1}`} title="Remove image"><Trash2 size={15} /></button></div>)}</section>
      <label>Highlights <small>One per line</small><textarea value={form.highlights.join("\n")} onChange={(event) => setTextList("highlights", event.target.value)} /></label>
      {formError && <p className="bd-error">{formError}</p>}<footer><button type="button" className="bd-button secondary" onClick={() => setForm(null)}>Cancel</button><button className="bd-button primary" disabled={pending}>Save product <Check size={15} /></button></footer>
    </form></section></div>}
  </div>;
}

function DataTools({ database, loading, error, purge, pending }: { database?: DatabaseOverview; loading: boolean; error: Error | null; purge: (payload: Record<string, unknown>) => Promise<{ deleted: number }>; pending: boolean }) {
  const [target, setTarget] = useState<"orders" | "analytics">("orders");
  const [age, setAge] = useState("30");
  const [status, setStatus] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [result, setResult] = useState("");
  const [all, setAll] = useState(false);
  const remove = async (event: FormEvent) => {
    event.preventDefault();
    if (confirmText !== "DELETE") return;
    try {
      const response = await purge({ target, confirm: confirmText, all, ...(all ? {} : { olderThanDays: Number(age) }), ...(target === "orders" && status ? { status } : {}) });
      setResult(`${response.deleted} ${target} record(s) deleted.`);
      setConfirmText("");
    } catch (purgeError) {
      setResult(purgeError instanceof Error ? purgeError.message : "Delete failed");
    }
  };
  return <div className="bd-content">
    <div className="bd-page-intro"><div><h2>Database and retention</h2><p>Inspect live table counts, then remove records with an explicit confirmation.</p></div><span className="bd-data-stamp"><Database size={15} /> Production database</span></div>
    {loading ? <div className="bd-state">Reading database overview...</div> : error ? <div className="bd-state error">{error.message}</div> : database && <>
      <div className="bd-db-metrics"><div><span>Products</span><strong>{database.products}</strong></div><div><span>Orders</span><strong>{database.orders}</strong></div><div><span>Analytics days</span><strong>{database.analyticsDays}</strong></div><div><span>Oldest order</span><strong>{database.oldestOrder ? dateOnly(database.oldestOrder) : "None"}</strong></div><div><span>Latest order</span><strong>{database.newestOrder ? dateOnly(database.newestOrder) : "None"}</strong></div></div>
      <div className="bd-db-detail-grid"><Panel title="Orders by status" eyebrow="LIVE DATABASE"><div className="bd-stat-lines">{database.statuses.map((item) => <div key={item.status}><span>{item.status}</span><strong>{item.count}</strong></div>)}</div></Panel><Panel title="Table storage" eyebrow="POSTGRESQL"><div className="bd-stat-lines">{database.sizes.length ? database.sizes.map((item) => <div key={item.name}><span>{item.name}</span><strong>{(item.bytes / 1024).toFixed(1)} KB</strong></div>) : <p className="bd-muted">Storage size is unavailable for this database.</p>}</div></Panel></div>
    </>}
    <section className="bd-danger-zone"><div><span className="bd-overline">DESTRUCTIVE ACTION</span><h2>Delete stored records</h2><p>Customer records are derived from orders. Deleting orders removes those records from customer views. This cannot be undone.</p></div>
      <form onSubmit={remove}>
        <label>Data type<select value={target} onChange={(event) => setTarget(event.target.value as "orders" | "analytics")}><option value="orders">Orders</option><option value="analytics">Daily analytics</option></select></label>
        <label className="bd-check-label"><input type="checkbox" checked={all} onChange={(event) => setAll(event.target.checked)} />Delete all {target}</label>
        {!all && <label>Older than<select value={age} onChange={(event) => setAge(event.target.value)}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">365 days</option></select></label>}
        {target === "orders" && !all && <label>Status filter<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Any status</option><option>Processing</option><option>Confirmed</option><option>Shipped</option><option>Delivered</option><option>Cancelled</option></select></label>}
        <label>Type DELETE to confirm<input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" /></label>
        <button className="bd-button danger" disabled={pending || confirmText !== "DELETE"}><Trash2 size={15} /> Delete matching data</button>
        {result && <p className={result.includes("deleted") ? "bd-success" : "bd-error"}>{result}</p>}
      </form>
    </section>
  </div>;
}

function RankedList({ rows, empty }: { rows: { label: string; detail: string; value: string }[]; empty: string }) {
  if (!rows.length) return <EmptyState label={empty} />;
  return <div className="bd-ranked">{rows.map((row, index) => <div key={row.label}><span className="bd-rank">{String(index + 1).padStart(2, "0")}</span><span className="bd-rank-name"><strong>{row.label}</strong><small>{row.detail}</small></span><b>{row.value}</b></div>)}</div>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="bd-empty"><Boxes size={22} /><span>{label}</span></div>;
}

export { AdminApp };