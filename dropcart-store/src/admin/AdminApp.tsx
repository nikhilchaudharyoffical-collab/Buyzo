import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminCreateProduct,
  useAdminDeleteProduct,
  useGetAdminAnalytics,
  useAdminGetOrders,
  useAdminGetProducts,
  useAdminUpdateOrder,
  useAdminUpdateProduct,
} from "@workspace/api-client-react";
import type { Order, OrderStatus, Product } from "@workspace/api-client-react";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit2,
  ExternalLink,
  Eye,
  LayoutDashboard,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  Trash2,
  TrendingUp,
  XCircle,
} from "lucide-react";
import "./AdminApp.css";

const STATUS_OPTIONS: OrderStatus[] = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

export const AdminApp: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<
    "overview" | "products" | "orders" | "analytics"
  >("overview");

  // Search & Filter state
  const [productSearch, setProductSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");

  // Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formOriginalPrice, setFormOriginalPrice] = useState("");
  const [formImages, setFormImages] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formInventory, setFormInventory] = useState("");
  const [formFeatured, setFormFeatured] = useState(false);

  // Queries
  const { data: analytics, isLoading: analyticsLoading } =
    useAdminGetAnalytics();
  const { data: productsData, isLoading: productsLoading } =
    useAdminGetProducts();
  const { data: ordersData, isLoading: ordersLoading } = useAdminGetOrders();

  // Mutations
  const createProduct = useAdminCreateProduct({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
        closeProductModal();
      },
    },
  });

  const updateProduct = useAdminUpdateProduct({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
        closeProductModal();
      },
    },
  });

  const deleteProduct = useAdminDeleteProduct({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
      },
    },
  });

  const updateOrder = useAdminUpdateOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
      },
    },
  });

  const products = productsData || [];
  const orders = ordersData || [];

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setFormTitle("");
    setFormDescription("");
    setFormPrice("");
    setFormOriginalPrice("");
    setFormImages("");
    setFormCategory("");
    setFormInventory("10");
    setFormFeatured(false);
    setIsProductModalOpen(true);
  };

  const handleOpenEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormTitle(p.title);
    setFormDescription(p.description || "");
    setFormPrice(p.price.toString());
    setFormOriginalPrice(p.originalPrice ? p.originalPrice.toString() : "");
    setFormImages(p.images ? p.images.join("\n") : "");
    setFormCategory(p.category || "");
    setFormInventory(p.inventory !== undefined ? p.inventory.toString() : "10");
    setFormFeatured(!!p.featured);
    setIsProductModalOpen(true);
  };

  const closeProductModal = () => {
    setIsProductModalOpen(false);
    setEditingProduct(null);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const imagesArray = formImages
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    const payload = {
      title: formTitle,
      description: formDescription,
      price: parseFloat(formPrice) || 0,
      originalPrice: formOriginalPrice ? parseFloat(formOriginalPrice) : undefined,
      images: imagesArray.length > 0 ? imagesArray : ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=60"],
      category: formCategory || "General",
      inventory: parseInt(formInventory, 10) || 0,
      featured: formFeatured,
    };

    if (editingProduct) {
      updateProduct.mutate({
        id: editingProduct.id,
        data: payload,
      });
    } else {
      createProduct.mutate({
        data: payload,
      });
    }
  };

  const handleDeleteProduct = (id: string) => {
    if (window.confirm("Are you sure you want to delete this product?")) {
      deleteProduct.mutate({ id });
    }
  };

  const handleOrderStatusChange = (orderId: string, newStatus: OrderStatus) => {
    updateOrder.mutate({
      id: orderId,
      data: { status: newStatus },
    });
  };

  const filteredProducts = products.filter((p) =>
    p.title.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.category?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const filteredOrders = orders.filter((o) =>
    orderStatusFilter === "all" ? true : o.status === orderStatusFilter
  );

  const getStatusBadgeClass = (status: OrderStatus) => {
    switch (status) {
      case "delivered": return "status-badge status-delivered";
      case "shipped": return "status-badge status-shipped";
      case "processing": return "status-badge status-processing";
      case "pending": return "status-badge status-pending";
      case "cancelled": return "status-badge status-cancelled";
      default: return "status-badge";
    }
  };

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <Store className="brand-icon" />
          <div className="brand-text">
            <h2>Buyzo</h2>
            <span>Admin Portal</span>
          </div>
        </div>

        <nav className="sidebar-menu">
          <button
            className={`menu-item ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            <LayoutDashboard size={18} />
            <span>Overview</span>
          </button>
          <button
            className={`menu-item ${activeTab === "products" ? "active" : ""}`}
            onClick={() => setActiveTab("products")}
          >
            <Package size={18} />
            <span>Products</span>
            <span className="count-badge">{products.length}</span>
          </button>
          <button
            className={`menu-item ${activeTab === "orders" ? "active" : ""}`}
            onClick={() => setActiveTab("orders")}
          >
            <ShoppingBag size={18} />
            <span>Orders</span>
            <span className="count-badge">{orders.length}</span>
          </button>
          <button
            className={`menu-item ${activeTab === "analytics" ? "active" : ""}`}
            onClick={() => setActiveTab("analytics")}
          >
            <BarChart3 size={18} />
            <span>Analytics</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <a to="/" className="store-link">
            <ExternalLink size={16} />
            <span>View Live Store</span>
          </a>
        </div>
      </aside>

      {/* Main Area */}
      <main className="admin-main">
        <header className="admin-header">
          <div className="header-title">
            <h1>
              {activeTab === "overview" && "Dashboard Overview"}
              {activeTab === "products" && "Product Management"}
              {activeTab === "orders" && "Order Management"}
              {activeTab === "analytics" && "Sales & Store Analytics"}
            </h1>
            <p>Manage your e-commerce operations seamlessly</p>
          </div>

          <div className="header-actions">
            {activeTab === "products" && (
              <button className="btn btn-primary" onClick={handleOpenAddModal}>
                <Plus size={16} /> Add Product
              </button>
            )}
          </div>
        </header>

        <div className="admin-content">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="tab-pane">
              {/* Analytics Summary */}
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-header">
                    <span>Total Revenue</span>
                    <DollarSign className="kpi-icon text-emerald" />
                  </div>
                  <div className="kpi-value">
                    ₹{analytics?.summary?.totalSales?.toLocaleString("en-IN") || "0"}
                  </div>
                  <div className="kpi-subtext">Lifetime gross sales</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-header">
                    <span>Total Orders</span>
                    <ShoppingBag className="kpi-icon text-indigo" />
                  </div>
                  <div className="kpi-value">{analytics?.summary?.totalOrders || 0}</div>
                  <div className="kpi-subtext">Across all status types</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-header">
                    <span>Active Products</span>
                    <Package className="kpi-icon text-amber" />
                  </div>
                  <div className="kpi-value">{products.length}</div>
                  <div className="kpi-subtext">In store catalog</div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-header">
                    <span>Pending Orders</span>
                    <Clock className="kpi-icon text-rose" />
                  </div>
                  <div className="kpi-value">
                    {orders.filter((o) => o.status === "pending" || o.status === "processing").length}
                  </div>
                  <div className="kpi-subtext">Requires fulfillment</div>
                </div>
              </div>

              {/* Recent Orders Preview */}
              <div className="panel-card">
                <div className="panel-header">
                  <h3>Recent Orders</h3>
                  <button className="btn-link" onClick={() => setActiveTab("orders")}>
                    View All Orders
                  </button>
                </div>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order ID</th>
                        <th>Customer</th>
                        <th>Status</th>
                        <th>Amount</th>
                        <th>Payment</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.slice(0, 5).map((order) => (
                        <tr key={order.id}>
                          <td className="font-mono">{order.id.slice(0, 8)}...</td>
                          <td>
                            <div className="customer-info">
                              <span className="customer-name">{order.customerName}</span>
                              <span className="customer-email">{order.customerEmail}</span>
                            </div>
                          </td>
                          <td>
                            <span className={getStatusBadgeClass(order.status)}>
                              {order.status}
                            </span>
                          </td>
                          <td className="font-semibold">₹{order.totalAmount}</td>
                          <td className="uppercase text-xs">{order.paymentMethod}</td>
                          <td className="text-muted">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                      {orders.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-6 text-muted">
                            No orders placed yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PRODUCTS */}
          {activeTab === "products" && (
            <div className="tab-pane">
              <div className="filter-bar">
                <div className="search-box">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Search by title or category..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="panel-card">
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Price</th>
                        <th>Inventory</th>
                        <th>Featured</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <div className="product-cell">
                              <img
                                src={p.images?.[0] || "https://placehold.co/100"}
                                alt={p.title}
                                className="product-thumb"
                              />
                              <div>
                                <span className="product-title">{p.title}</span>
                                <span className="product-id font-mono">{p.id.slice(0, 8)}</span>
                              </div>
                            </div>
                          </td>
                          <td><span className="tag">{p.category || "General"}</span></td>
                          <td>
                            <div className="price-cell">
                              <span className="current-price">₹{p.price}</span>
                              {p.originalPrice && (
                                <span className="original-price">₹{p.originalPrice}</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className={p.inventory < 5 ? "text-rose font-bold" : ""}>
                              {p.inventory} units
                            </span>
                          </td>
                          <td>
                            {p.featured ? (
                              <span className="badge badge-success">Featured</span>
                            ) : (
                              <span className="badge badge-muted">Standard</span>
                            )}
                          </td>
                          <td className="text-right">
                            <div className="action-buttons">
                              <button
                                className="btn-icon"
                                onClick={() => handleOpenEditModal(p)}
                                title="Edit Product"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                className="btn-icon text-rose"
                                onClick={() => handleDeleteProduct(p.id)}
                                title="Delete Product"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredProducts.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-6 text-muted">
                            No products found matching your search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ORDERS */}
          {activeTab === "orders" && (
            <div className="tab-pane">
              <div className="filter-bar">
                <div className="filter-group">
                  <label>Status Filter:</label>
                  <select
                    value={orderStatusFilter}
                    onChange={(e) => setOrderStatusFilter(e.target.value)}
                    className="select-input"
                  >
                    <option value="all">All Orders ({orders.length})</option>
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="shipped">Shipped</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="panel-card">
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order Details</th>
                        <th>Customer</th>
                        <th>Shipping Address</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Update Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.map((order) => (
                        <tr key={order.id}>
                          <td>
                            <div className="order-cell">
                              <span className="font-mono font-bold">#{order.id.slice(0, 8)}</span>
                              <span className="text-muted text-xs">
                                {new Date(order.createdAt).toLocaleString()}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="customer-info">
                              <span className="customer-name">{order.customerName}</span>
                              <span className="customer-email">{order.customerEmail}</span>
                            </div>
                          </td>
                          <td>
                            <div className="address-cell">
                              <p>{order.shippingAddress?.street}</p>
                              <p>
                                {order.shippingAddress?.city},{" "}
                                {order.shippingAddress?.zipCode}
                              </p>
                            </div>
                          </td>
                          <td>
                            <span className="font-semibold text-emerald">
                              ₹{order.totalAmount}
                            </span>
                            <span className="block text-xs text-muted uppercase">
                              {order.paymentMethod}
                            </span>
                          </td>
                          <td>
                            <span className={getStatusBadgeClass(order.status)}>
                              {order.status}
                            </span>
                          </td>
                          <td>
                            <select
                              value={order.status}
                              onChange={(e) =>
                                handleOrderStatusChange(
                                  order.id,
                                  e.target.value as OrderStatus
                                )
                              }
                              className="select-input-sm"
                            >
                              {STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>
                                  {status.toUpperCase()}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                      {filteredOrders.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-6 text-muted">
                            No orders found for selected filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ANALYTICS */}
          {activeTab === "analytics" && (
            <div className="tab-pane">
              <div className="panel-card">
                <h3>Daily Revenue & Orders Overview</h3>
                <div className="analytics-list">
                  {analytics?.dailyData?.map((day) => (
                    <div key={day.date} className="analytics-row">
                      <span className="font-mono">{day.date}</span>
                      <div className="analytics-bar-container">
                        <div
                          className="analytics-bar"
                          style={{
                            width: `${Math.min(100, (day.sales / 10000) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="font-semibold">₹{day.sales}</span>
                      <span className="text-muted text-xs">({day.orders} orders)</span>
                    </div>
                  ))}
                  {(!analytics?.dailyData || analytics.dailyData.length === 0) && (
                    <p className="text-muted py-4">No daily analytics data recorded yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Product Add / Edit Modal */}
      {isProductModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editingProduct ? "Edit Product" : "Add New Product"}</h2>
              <button className="btn-icon" onClick={closeProductModal}>
                <XCircle size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveProduct} className="modal-form">
              <div className="form-group">
                <label>Product Title *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Wireless Noise Cancelling Headphones"
                />
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    placeholder="2999"
                  />
                </div>
                <div className="form-group">
                  <label>Original Price (MRP ₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formOriginalPrice}
                    onChange={(e) => setFormOriginalPrice(e.target.value)}
                    placeholder="4999"
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>Category *</label>
                  <input
                    type="text"
                    required
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="Electronics, Apparel, etc."
                  />
                </div>
                <div className="form-group">
                  <label>Inventory Units *</label>
                  <input
                    type="number"
                    required
                    value={formInventory}
                    onChange={(e) => setFormInventory(e.target.value)}
                    placeholder="50"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Provide product features and details..."
                />
              </div>

              <div className="form-group">
                <label>Image URLs (One URL per line)</label>
                <textarea
                  rows={3}
                  value={formImages}
                  onChange={(e) => setFormImages(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                />
              </div>

              <div className="form-checkbox">
                <input
                  type="checkbox"
                  id="featured"
                  checked={formFeatured}
                  onChange={(e) => setFormFeatured(e.target.checked)}
                />
                <label htmlFor="featured">Feature this product on homepage</label>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeProductModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingProduct ? "Save Changes" : "Create Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
    
