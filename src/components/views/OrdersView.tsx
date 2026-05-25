"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useStore, Order, ClientStore, WhatsappTemplate } from "@/store/useStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { useToast } from "@/components/ui/toast";
import { collection, query, where, orderBy, onSnapshot, getDocs, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import confetti from "canvas-confetti";

const STATUS_LABELS: { [key: string]: string } = {
  new: "New Order",
  whatsapp_sent: "WhatsApp Sent",
  awaiting_confirmation: "Awaiting Conf.",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  fraud: "Fraud Flagged",
};

export const OrdersView: React.FC = () => {
  const {
    orders,
    clients,
    user,
    currentClientId,
    ordersLimitCount,
    increaseOrdersLimit,
    deepSearchedOrders,
    setDeepSearchedOrders,
    setCurrentClientId,
  } = useStore();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // Selected Order for CRM Detail Modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [customMsgContent, setCustomMsgContent] = useState("");
  const [newNote, setNewNote] = useState("");
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  
  // Real-time timeline logs for selected order
  const [timelineLogs, setTimelineLogs] = useState<any[]>([]);

  // Bulk actions selection
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  // Optimization & UX states
  const [isDeepSearching, setIsDeepSearching] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [isCompactMode, setIsCompactMode] = useState(false);

  // CSV Import states
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [parsedOrdersCount, setParsedOrdersCount] = useState<number | null>(null);
  const [parsedOrdersList, setParsedOrdersList] = useState<any[]>([]);

  // 1. Fetch Timeline Logs for the selected order dynamically
  useEffect(() => {
    if (!selectedOrder) {
      setTimelineLogs([]);
      return;
    }

    const logsQuery = query(
      collection(db, "activity_logs"),
      where("orderId", "==", selectedOrder.id),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(logsQuery, (snapshot) => {
      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setTimelineLogs(logs);
    });

    return () => unsubscribe();
  }, [selectedOrder]);

  // 2. Evaluate template placeholders dynamically
  const evaluateTemplate = (templateMsg: string, order: Order) => {
    const client = clients.find((c) => c.id === order.clientId);
    const storeName = client ? client.name : "our store";
    const productNames = order.products.map((p) => `${p.name} (x${p.qty})`).join(", ");

    return templateMsg
      .replace(/\{\{customer_name\}\}/g, order.customerName)
      .replace(/\{\{store_name\}\}/g, storeName)
      .replace(/\{\{order_number\}\}/g, order.orderNumber)
      .replace(/\{\{order_id\}\}/g, order.orderNumber)
      .replace(/\{\{products\}\}/g, productNames)
      .replace(/\{\{product_name\}\}/g, productNames)
      .replace(/\{\{amount\}\}/g, String(order.totalAmount))
      .replace(/\{\{address\}\}/g, order.address)
      .replace(/\{\{currency\}\}/g, "₹") // Default currency symbol
      .trim();
  };

  // 3. Listen to template dropdown changes inside the modal
  const handleTemplateChange = (templateId: string, order: Order) => {
    setSelectedTemplateId(templateId);
    const client = clients.find((c) => c.id === order.clientId);
    if (!client) return;
    const tpl = client.whatsappTemplates?.find((t) => t.id === templateId);
    if (tpl) {
      setCustomMsgContent(evaluateTemplate(tpl.message, order));
    }
  };

  // Initialize template options on order selection
  useEffect(() => {
    if (selectedOrder) {
      const client = clients.find((c) => c.id === selectedOrder.clientId);
      if (client && client.whatsappTemplates && client.whatsappTemplates.length > 0) {
        const defaultTpl = client.whatsappTemplates[0]!;
        setSelectedTemplateId(defaultTpl.id);
        setCustomMsgContent(evaluateTemplate(defaultTpl.message, selectedOrder));
      } else {
        setSelectedTemplateId("");
        setCustomMsgContent("");
      }
    }
  }, [selectedOrder, clients]);

  // Deep database search handler
  const handleDeepSearch = async () => {
    if (!searchTerm.trim()) {
      toast("Please enter a search query.", "warning");
      return;
    }
    setIsDeepSearching(true);
    try {
      const ordersRef = collection(db, "orders");
      let q;
      const searchVal = searchTerm.trim();

      if (/^\d+$/.test(searchVal)) {
        q = query(ordersRef, where("phone", "==", searchVal), limit(15));
      } else {
        q = query(ordersRef, where("orderNumber", "==", searchVal), limit(15));
      }

      const snap = await getDocs(q);
      const results: Order[] = snap.docs.map((doc) => {
        const data = doc.data();
        return { id: doc.id, ...data } as Order;
      });

      if (results.length === 0) {
        const prefixQuery = query(
          ordersRef,
          where("customerName", ">=", searchVal),
          where("customerName", "<=", searchVal + "\uf8ff"),
          limit(15)
        );
        const prefixSnap = await getDocs(prefixQuery);
        prefixSnap.forEach((doc) => {
          results.push({ id: doc.id, ...doc.data() } as Order);
        });
      }

      // Filter based on client authorization scopes
      const authorizedResults = results.filter((o) => {
        if (user?.role === "super_admin") return true;
        return user?.clientIds.includes(o.clientId);
      });

      if (authorizedResults.length > 0) {
        setDeepSearchedOrders(authorizedResults);
        toast(`Deep Search found ${authorizedResults.length} matching order(s)!`, "success");
      } else {
        toast("No matching orders found in the database.", "warning");
      }
    } catch (err: any) {
      console.error(err);
      toast("Deep search failed. Try again.", "error");
    } finally {
      setIsDeepSearching(false);
    }
  };

  // Merge real-time items with deep search results, eliminating duplicates
  const allAvailableOrders = useMemo(() => {
    const merged = [...deepSearchedOrders, ...orders];
    const seen = new Set();
    return merged.filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });
  }, [orders, deepSearchedOrders]);

  // Keyboard shortcut listener for active CRM details
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedOrder || !isDetailOpen) return;

      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "escape") {
        setIsDetailOpen(false);
      } else if (key === "w") {
        handleSendWhatsApp(selectedOrder);
      } else if (key === "c") {
        handleUpdateStatus(selectedOrder.id, "confirmed");
      } else if (key === "x") {
        handleUpdateStatus(selectedOrder.id, "cancelled");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedOrder, isDetailOpen, customMsgContent]);

  // Command palette keyboard listener
  useEffect(() => {
    const handlePaletteTrigger = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const isCmdK = (e.metaKey || e.ctrlKey) && key === "k";
      const isSlash = key === "/" && (!document.activeElement || (document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA"));

      if (isCmdK || isSlash) {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handlePaletteTrigger);
    return () => window.removeEventListener("keydown", handlePaletteTrigger);
  }, []);

  // 4. Filter Orders based on active parameters
  const filteredOrders = useMemo(() => {
    return allAvailableOrders.filter((order) => {
      // Tab status filter
      if (activeTab !== "all") {
        if (activeTab === "pending" && !["new", "whatsapp_sent", "awaiting_confirmation"].includes(order.confirmationStatus)) {
          return false;
        } else if (activeTab === "confirmed" && !["confirmed", "processing", "shipped", "delivered"].includes(order.confirmationStatus)) {
          return false;
        } else if (activeTab === "cancelled" && order.confirmationStatus !== "cancelled") {
          return false;
        }
      }

      // Search query filter (Order number, customer name, phone)
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const matchesSearch =
          order.orderNumber.toLowerCase().includes(query) ||
          order.customerName.toLowerCase().includes(query) ||
          order.phone.includes(query);
        if (!matchesSearch) return false;
      }

      // Payment Type Filter
      if (paymentFilter !== "all") {
        const isCODType = paymentFilter === "cod";
        if (order.isCod !== isCODType) return false;
      }

      return true;
    });
  }, [allAvailableOrders, activeTab, searchTerm, paymentFilter]);

  // Bulk actions helpers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedOrderIds(filteredOrders.map((o) => o.id));
    } else {
      setSelectedOrderIds([]);
    }
  };

  const handleSelectOrder = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedOrderIds((prev) => [...prev, id]);
    } else {
      setSelectedOrderIds((prev) => prev.filter((oid) => oid !== id));
    }
  };

  const executeBulkStatusChange = async (status: "confirmed" | "cancelled") => {
    if (selectedOrderIds.length === 0) return;
    setIsUpdatingOrder(true);
    try {
      const token = await (await import("@/lib/firebase")).auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch("/api/orders/bulk", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderIds: selectedOrderIds,
          confirmationStatus: status,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Batch transaction failed");
      }

      const resData = await response.json();

      toast(`Bulk updated ${resData.updatedCount} orders successfully in a single batch!`, "success");
      setSelectedOrderIds([]);
      if (status === "confirmed") {
        confetti({ particleCount: 100, spread: 60, origin: { y: 0.8 } });
      }
    } catch (error: any) {
      console.error(error);
      toast(error.message || "Error performing batch updates", "error");
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  // WhatsApp click-to-chat action
  const handleSendWhatsApp = async (order: Order) => {
    if (!customMsgContent) {
      toast("Template content is empty", "warning");
      return;
    }

    try {
      // 1. Log message send event on server first
      const token = await (await import("@/lib/firebase")).auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`/api/orders/${order.id}/whatsapp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone: order.phone,
          messageContent: customMsgContent,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to record WhatsApp log");
      }

      // Update local state if detailed view is open
      if (selectedOrder && selectedOrder.id === order.id) {
        setSelectedOrder({
          ...selectedOrder,
          confirmationStatus: "whatsapp_sent",
        });
      }

      // 2. Open WhatsApp Web Click-To-Chat URL
      // Clean phone number (remove +, spaces, leading zeros)
      const cleanPhone = order.phone.replace(/[^0-9]/g, "");
      const encodedMsg = encodeURIComponent(customMsgContent);
      
      const isMobileOrTablet = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      
      const whatsappUrl = isMobileOrTablet
        ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`
        : `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`;

      window.open(whatsappUrl, "whatsapp_window");

      toast(isMobileOrTablet ? "Redirecting to WhatsApp App..." : "Opening WhatsApp Web...", "success");
    } catch (err: any) {
      toast(err.message || "Failed to trigger message", "error");
    }
  };

  const handleUpdateStatus = async (orderId: string, status: string) => {
    setIsUpdatingOrder(true);
    try {
      const token = await (await import("@/lib/firebase")).auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmationStatus: status,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update status");
      }

      toast(`Order set to ${status}!`, "success");
      
      // Update selected order in state to reflect change immediately
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({
          ...selectedOrder,
          confirmationStatus: status as any,
        });
      }

      // Sparkles!
      if (status === "confirmed") {
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      }
    } catch (error) {
      console.error(error);
      toast("Failed to update order status", "error");
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !selectedOrder) return;

    setIsUpdatingOrder(true);
    try {
      const token = await (await import("@/lib/firebase")).auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`/api/orders/${selectedOrder.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          noteText: newNote.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to add comment note");
      }

      toast("Internal CRM comment posted!", "success");
      
      // Sync notes locally
      const updatedNotes = [
        ...(selectedOrder.notes || []),
        { text: newNote.trim(), author: user?.displayName || user?.email || "Staff", timestamp: new Date() },
      ];

      setSelectedOrder({
        ...selectedOrder,
        notes: updatedNotes,
      });

      setNewNote("");
    } catch (error) {
      console.error(error);
      toast("Error creating CRM note", "error");
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  const copyAddressToClipboard = (addressStr: string) => {
    navigator.clipboard.writeText(addressStr);
    toast("Address copied to clipboard!", "success");
  };
  const parseCsv = (text: string): string[][] => {
    const result: string[][] = [];
    let row: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim());
        current = "";
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        row.push(current.trim());
        result.push(row);
        row = [];
        current = "";
      } else {
        current += char;
      }
    }
    
    if (row.length > 0 || current.length > 0) {
      row.push(current.trim());
      result.push(row);
    }
    
    return result;
  };

  const parseShopifyCsv = (text: string): any[] => {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error("CSV file is empty or missing headers");

    const headers = rows[0]!.map((h) => h.toLowerCase().replace(/['"]/g, ""));
    
    const idxName = headers.indexOf("name");
    const idxEmail = headers.indexOf("email");
    const idxTotal = headers.indexOf("total");
    const idxPayment = headers.indexOf("payment method") !== -1 ? headers.indexOf("payment method") : headers.indexOf("gateway");
    const idxGateway = headers.indexOf("gateway");
    const idxCreated = headers.indexOf("created at");
    const idxFulfillment = headers.indexOf("fulfillment status");
    const idxPhone = headers.indexOf("shipping phone") !== -1 ? headers.indexOf("shipping phone") : (headers.indexOf("phone") !== -1 ? headers.indexOf("phone") : headers.indexOf("billing phone"));
    const idxCustName = headers.indexOf("shipping name") !== -1 ? headers.indexOf("shipping name") : (headers.indexOf("billing name") !== -1 ? headers.indexOf("billing name") : headers.indexOf("name"));
    const idxAddr1 = headers.indexOf("shipping address1");
    const idxAddr2 = headers.indexOf("shipping address2");
    const idxCity = headers.indexOf("shipping city");
    const idxState = headers.indexOf("shipping province");
    const idxZip = headers.indexOf("shipping zip");
    const idxCountry = headers.indexOf("shipping country");
    const idxLineQty = headers.indexOf("lineitem quantity");
    const idxLineName = headers.indexOf("lineitem name");
    const idxLinePrice = headers.indexOf("lineitem price");
    const idxNote = headers.indexOf("notes") !== -1 ? headers.indexOf("notes") : headers.indexOf("note");
    const idxTags = headers.indexOf("tags");

    if (idxName === -1) {
      throw new Error("Missing required 'Name' column in Shopify orders CSV.");
    }

    const ordersMap: { [key: string]: any } = {};
    let activeOrderKey = "";

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i]!;
      if (cols.length < headers.length) continue;

      const orderName = cols[idxName];

      if (orderName) {
        activeOrderKey = orderName;
        
        const total = parseFloat(cols[idxTotal] || "0");
        const billingPhone = cols[idxPhone] || "";
        const shippingName = cols[idxCustName] || "";
        const payment = cols[idxPayment] || cols[idxGateway] || "";
        const tags = cols[idxTags] ? cols[idxTags].split(",").map((t) => t.trim()).filter(Boolean) : [];
        const note = cols[idxNote] || "";
        
        const lineItem = {
          id: Date.now() + Math.random(),
          name: cols[idxLineName] || "Unknown Item",
          qty: parseInt(cols[idxLineQty] || "1", 10),
          price: parseFloat(cols[idxLinePrice] || "0"),
          variant: "Default",
        };

        ordersMap[activeOrderKey] = {
          id: orderName,
          name: orderName,
          email: cols[idxEmail] || "",
          totalAmount: total,
          phone: billingPhone,
          customerName: shippingName || "Guest Customer",
          address: `${cols[idxAddr1] || ""} ${cols[idxAddr2] || ""}`.trim(),
          city: cols[idxCity] || "",
          state: cols[idxState] || "",
          zip: cols[idxZip] || "",
          country: cols[idxCountry] || "",
          paymentMethod: payment || "Manual",
          fulfillmentStatus: cols[idxFulfillment] || "unfulfilled",
          createdAt: cols[idxCreated] || new Date().toISOString(),
          tags,
          note,
          lineItems: [lineItem],
        };
      } else if (activeOrderKey && ordersMap[activeOrderKey]) {
        const lineItem = {
          id: Date.now() + Math.random(),
          name: cols[idxLineName] || "Unknown Item",
          qty: parseInt(cols[idxLineQty] || "1", 10),
          price: parseFloat(cols[idxLinePrice] || "0"),
          variant: "Default",
        };
        ordersMap[activeOrderKey].lineItems.push(lineItem);
      }
    }

    return Object.values(ordersMap);
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const orders = parseShopifyCsv(text);
        setParsedOrdersList(orders);
        setParsedOrdersCount(orders.length);
        toast(`Parsed ${orders.length} orders from CSV! Ready to import.`, "success");
      } catch (err: any) {
        toast(`CSV parse error: ${err.message}`, "error");
      }
    };
    reader.readAsText(file);
  };

  const handleImportOrders = async () => {
    if (!currentClientId) {
      toast("Please select a specific store brand from the sidebar first.", "warning");
      return;
    }
    if (parsedOrdersList.length === 0) {
      toast("No orders to import. Please select a valid Shopify CSV file.", "warning");
      return;
    }

    setIsImporting(true);
    try {
      const token = await (await import("@/lib/firebase")).auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch("/api/orders/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: currentClientId,
          orders: parsedOrdersList,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to import CSV");
      }

      toast(`Successfully imported ${data.importedCount} new orders! (${data.duplicateCount} duplicate order IDs skipped)`, "success");
      setIsImportOpen(false);
      setCsvFile(null);
      setParsedOrdersList([]);
      setParsedOrdersCount(null);
    } catch (err: any) {
      console.error(err);
      toast(err.message || "CSV import operation failed", "error");
    } finally {
      setIsImporting(false);
    }
  };

  const handleShareSelectedToGroup = () => {
    if (selectedOrderIds.length === 0) return;

    const targetOrders = allAvailableOrders.filter((o) => selectedOrderIds.includes(o.id));
    if (targetOrders.length === 0) return;

    const client = clients.find((c) => c.id === targetOrders[0]!.clientId);
    const storeName = client ? client.name : "VeriCRM Store";

    // Header
    let msg = `📢 *CONFIRMED ORDERS SUMMARY* - *${storeName.toUpperCase()}*\n\n`;

    let totalAmount = 0;
    targetOrders.forEach((order, idx) => {
      const productSummary = order.products.map((p) => `• ${p.name} (x${p.qty})`).join("\n");
      msg += `*${idx + 1}. Order #${order.orderNumber}* - ${order.customerName} - ₹${order.totalAmount}\n`;
      msg += `${productSummary}\n`;
      msg += `📍 Address: ${order.address}, ${order.city}\n`;
      msg += `📞 Phone: ${order.phone}\n\n`;
      totalAmount += order.totalAmount;
    });

    // Footer
    msg += `---\n`;
    msg += `📦 *Total Orders:* ${targetOrders.length}\n`;
    msg += `💰 *Total Value:* ₹${totalAmount}\n`;
    msg += `🚀 *Fulfillment Team:* Please initiate packaging and dispatching.`;

    // Copy the summary message to the clipboard (highly reliable backup for group pasting)
    navigator.clipboard.writeText(msg);

    const encodedMsg = encodeURIComponent(msg);
    const isMobileOrTablet = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

    const whatsappUrl = isMobileOrTablet
      ? `https://api.whatsapp.com/send?text=${encodedMsg}`
      : `https://web.whatsapp.com/send?text=${encodedMsg}`;

    window.open(whatsappUrl, "whatsapp_share_window");
    toast("Summary copied to clipboard! Select your group on WhatsApp and send (or paste) the message.", "success");
  };

  return (
    <div className="space-y-6">
      {/* Top dashboard stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => setActiveTab("all")}
          className={`glass-panel p-4 rounded-xl border text-left transition-all ${
            activeTab === "all" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-muted"
          }`}
        >
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            All Synced
          </div>
          <div className="text-2xl font-bold mt-1 text-foreground">
            {orders.length}
          </div>
        </button>

        <button
          onClick={() => setActiveTab("pending")}
          className={`glass-panel p-4 rounded-xl border text-left transition-all ${
            activeTab === "pending" ? "border-amber-500 bg-amber-500/5 ring-1 ring-amber-500" : "border-border hover:border-muted"
          }`}
        >
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            Awaiting verification
          </div>
          <div className="text-2xl font-bold mt-1 text-amber-500">
            {orders.filter((o) => ["new", "whatsapp_sent", "awaiting_confirmation"].includes(o.confirmationStatus)).length}
          </div>
        </button>

        <button
          onClick={() => setActiveTab("confirmed")}
          className={`glass-panel p-4 rounded-xl border text-left transition-all ${
            activeTab === "confirmed" ? "border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500" : "border-border hover:border-muted"
          }`}
        >
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            Confirmed Orders
          </div>
          <div className="text-2xl font-bold mt-1 text-emerald-500">
            {orders.filter((o) => ["confirmed", "processing", "shipped", "delivered"].includes(o.confirmationStatus)).length}
          </div>
        </button>
      </div>

      {/* FILTER CONTROLS BAR */}
      <div className="glass-panel p-4 rounded-xl border border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="flex gap-2 items-center flex-1 max-w-md">
          <div className="relative flex-1">
            <input
              type="text"
              className="w-full h-10 pl-9 pr-4 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Search local customer, phone, order..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          {searchTerm && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeepSearch}
              isLoading={isDeepSearching}
              className="h-10 text-xs px-3 border-dashed hover:border-primary shrink-0"
              title="Queries the entire database"
            >
              Search Db
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            className="h-10 rounded-lg border border-border bg-card px-3 text-xs text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
          >
            <option value="all">All Payments</option>
            <option value="cod">Cash on Delivery (COD)</option>
            <option value="prepaid">Prepaid (Card/UPI)</option>
          </select>

          {/* Compact View Toggle */}
          <button
            onClick={() => setIsCompactMode(!isCompactMode)}
            className={`h-10 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all ${
              isCompactMode
                ? "bg-primary/10 border-primary/20 text-primary shadow-sm shadow-primary/5"
                : "border-border bg-card text-muted-foreground hover:bg-secondary"
            }`}
            title="Toggle compact list spacing"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" />
            </svg>
            {isCompactMode ? "Compact" : "Comfortable"}
          </button>

          {/* Grid/Table Toggle */}
          <div className="flex bg-secondary rounded-lg p-0.5 border border-border">
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md ${viewMode === "table" ? "bg-card text-foreground shadow" : "text-muted-foreground"}`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md ${viewMode === "grid" ? "bg-card text-foreground shadow" : "text-muted-foreground"}`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 14a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 14a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
          </div>

          {/* Import CSV Button */}
          {user?.role !== "client_viewer" && (
            <Button
              variant="outline"
              size="sm"
              className="h-10 text-xs px-3 font-semibold flex items-center gap-1.5 border border-border hover:border-primary/50 hover:bg-secondary/40 shadow-sm"
              onClick={() => {
                if (!currentClientId) {
                  toast("Please select a specific store brand from the sidebar dropdown first.", "warning");
                } else {
                  setIsImportOpen(true);
                }
              }}
            >
              <svg className="h-4.5 w-4.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import CSV
            </Button>
          )}
        </div>
      </div>

      {/* BULK ACTIONS BANNER */}
      {selectedOrderIds.length > 0 && user?.role !== "client_viewer" && (
        <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl flex items-center justify-between animate-in slide-in-from-top-4 duration-200">
          <span className="text-xs font-bold text-primary">
            {selectedOrderIds.length} orders selected for batch actions
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedOrderIds([])}
            >
              Deselect All
            </Button>
            <Button
              variant="default"
              size="sm"
              isLoading={isUpdatingOrder}
              onClick={() => executeBulkStatusChange("confirmed")}
            >
              Bulk Confirm
            </Button>
            <Button
              variant="destructive"
              size="sm"
              isLoading={isUpdatingOrder}
              onClick={() => executeBulkStatusChange("cancelled")}
            >
              Bulk Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border border-green-500/40 text-green-600 dark:text-green-400 hover:bg-green-500/10 flex items-center gap-1.5 shadow-sm"
              onClick={handleShareSelectedToGroup}
            >
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share to Group
            </Button>
          </div>
        </div>
      )}

      {/* TABLE/GRID CONTENT */}
      {viewMode === "table" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-secondary/40 border-b border-border">
                {user?.role !== "client_viewer" && (
                  <th className={`${isCompactMode ? "p-2 text-xs" : "p-4"} w-10`}>
                    <input
                      type="checkbox"
                      className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                      checked={
                        filteredOrders.length > 0 &&
                        selectedOrderIds.length === filteredOrders.length
                      }
                      onChange={handleSelectAll}
                    />
                  </th>
                )}
                <th className={`${isCompactMode ? "p-2 text-xs" : "p-4"} font-bold text-foreground/80`}>Order Number</th>
                <th className={`${isCompactMode ? "p-2 text-xs" : "p-4"} font-bold text-foreground/80`}>Customer</th>
                <th className={`${isCompactMode ? "p-2 text-xs" : "p-4"} font-bold text-foreground/80`}>Payment Method</th>
                <th className={`${isCompactMode ? "p-2 text-xs" : "p-4"} font-bold text-foreground/80`}>Amount</th>
                <th className={`${isCompactMode ? "p-2 text-xs" : "p-4"} font-bold text-foreground/80`}>Verification State</th>
                <th className={`${isCompactMode ? "p-2 text-xs" : "p-4"} font-bold text-foreground/80 text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredOrders.map((order) => {
                const isSelected = selectedOrderIds.includes(order.id);
                const hasCheckbox = user?.role !== "client_viewer";
                return (
                  <tr
                    key={order.id}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest("input[type='checkbox']")) return;
                      const td = target.closest("td");
                      if (!td) return;
                      const cellIndex = td.cellIndex;
                      if (hasCheckbox) {
                        if (cellIndex === 0 || cellIndex === 1) return;
                      } else {
                        if (cellIndex === 0) return;
                      }
                      setSelectedOrder(order);
                      setIsDetailOpen(true);
                    }}
                    className={`hover:bg-accent/10 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                  >
                    {user?.role !== "client_viewer" && (
                      <td className={isCompactMode ? "p-2 text-xs cursor-default" : "p-4 cursor-default"}>
                        <input
                          type="checkbox"
                          className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                          checked={isSelected}
                          onChange={(e) => handleSelectOrder(order.id, e.target.checked)}
                        />
                      </td>
                    )}
                    <td className={`${isCompactMode ? "p-2 text-xs cursor-default" : "p-4 cursor-default"} font-bold text-foreground`}>
                      #{order.orderNumber}
                    </td>
                    <td className={`${isCompactMode ? "p-2 text-xs" : "p-4"} cursor-pointer`}>
                      <div className="font-semibold text-foreground">{order.customerName}</div>
                      <div className="text-xs text-muted-foreground">{order.phone || "No phone"}</div>
                    </td>
                    <td className={`${isCompactMode ? "p-2 text-xs" : "p-4"} cursor-pointer`}>
                      <Badge variant={order.isCod ? "warning" : "default"}>
                        {order.paymentMethod}
                      </Badge>
                    </td>
                    <td className={`${isCompactMode ? "p-2 text-xs" : "p-4"} font-semibold text-foreground cursor-pointer`}>
                      ₹{order.totalAmount}
                    </td>
                    <td className={`${isCompactMode ? "p-2 text-xs" : "p-4"} cursor-pointer`}>
                      <Badge
                        variant={
                          order.confirmationStatus === "confirmed" || order.confirmationStatus === "delivered"
                            ? "success"
                            : order.confirmationStatus === "cancelled" || order.confirmationStatus === "fraud"
                            ? "danger"
                            : "warning"
                        }
                        pulse={["new", "whatsapp_sent"].includes(order.confirmationStatus)}
                      >
                        {STATUS_LABELS[order.confirmationStatus] || order.confirmationStatus}
                      </Badge>
                    </td>
                    <td className={`${isCompactMode ? "p-2 text-xs" : "p-4"} text-right cursor-pointer`}>
                      <Button variant="secondary" size="sm">
                        Details
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground text-xs font-medium">
                    No matching orders inside this filtered segment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-200">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              className={`glass-panel p-5 rounded-xl border hover:border-primary/40 transition-all flex flex-col justify-between ${
                selectedOrderIds.includes(order.id) ? "border-primary bg-primary/5 shadow-md shadow-primary/5" : "border-border"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3.5">
                  <span className="font-bold text-base text-foreground">#{order.orderNumber}</span>
                  <Badge
                    variant={
                      order.confirmationStatus === "confirmed" || order.confirmationStatus === "delivered"
                        ? "success"
                        : order.confirmationStatus === "cancelled" || order.confirmationStatus === "fraud"
                        ? "danger"
                        : "warning"
                    }
                    pulse={["new", "whatsapp_sent"].includes(order.confirmationStatus)}
                  >
                    {STATUS_LABELS[order.confirmationStatus] || order.confirmationStatus}
                  </Badge>
                </div>

                <div className="space-y-1.5 mb-4">
                  <div className="text-sm font-semibold text-foreground">{order.customerName}</div>
                  <div className="text-xs text-muted-foreground">{order.phone}</div>
                  <div className="flex items-center gap-2 pt-1">
                    <Badge variant={order.isCod ? "warning" : "default"} className="text-[10px]">
                      {order.paymentMethod}
                    </Badge>
                    <span className="text-xs font-bold text-foreground">₹{order.totalAmount}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-3.5 border-t border-border/60">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSelectedOrder(order);
                    setIsDetailOpen(true);
                  }}
                >
                  View Details
                </Button>
              </div>
            </div>
          ))}
          {filteredOrders.length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground text-xs font-medium bg-card border border-border rounded-xl">
              No matching orders in this view.
            </div>
          )}
        </div>
      )}

      {/* LOAD MORE PAGINATION */}
      {orders.length >= ordersLimitCount && (
        <div className="flex justify-center pt-6 pb-2">
          <Button
            variant="outline"
            onClick={() => increaseOrdersLimit(50)}
            className="text-xs font-semibold tracking-wide border-dashed hover:border-primary hover:text-primary transition-all px-6 py-2.5 rounded-lg"
          >
            Load Older Orders (Page {Math.floor(ordersLimitCount / 50)})
          </Button>
        </div>
      )}

      {/* COMMAND PALETTE DIALOG */}
      <Dialog
        isOpen={isPaletteOpen}
        onClose={() => {
          setIsPaletteOpen(false);
          setPaletteSearch("");
        }}
        title="Quick Command Center"
      >
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              className="w-full h-11 pl-10 pr-4 rounded-lg border border-border bg-secondary/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Type a command or filter name... (e.g. 'compact', 'cod', 'confirmed')"
              value={paletteSearch}
              onChange={(e) => setPaletteSearch(e.target.value)}
              autoFocus
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {[
              { label: "Filter: View All Orders", action: () => { setActiveTab("all"); toast("Showing all orders", "info"); } },
              { label: "Filter: View Awaiting Verification", action: () => { setActiveTab("pending"); toast("Showing pending verification", "info"); } },
              { label: "Filter: View Confirmed Orders", action: () => { setActiveTab("confirmed"); toast("Showing confirmed orders", "info"); } },
              { label: "Filter: View Cash on Delivery (COD) Payments", action: () => { setPaymentFilter("cod"); toast("Showing COD orders", "info"); } },
              { label: "Filter: View Prepaid Payments", action: () => { setPaymentFilter("prepaid"); toast("Showing prepaid orders", "info"); } },
              { label: "Layout: Toggle Table View", action: () => { setViewMode("table"); } },
              { label: "Layout: Toggle Grid View", action: () => { setViewMode("grid"); } },
              { label: "Layout: Toggle Compact Mode spacing", action: () => { setIsCompactMode(!isCompactMode); } },
              ...clients.map((c) => ({
                label: `Store: Focus on ${c.name} brand`,
                action: () => { setCurrentClientId(c.id); toast(`Focused on ${c.name}`, "success"); }
              })),
              { label: "Store: Focus on All Managed Brands", action: () => { setCurrentClientId(null); toast("Focused on all stores", "success"); } }
            ]
              .filter((cmd) => cmd.label.toLowerCase().includes(paletteSearch.toLowerCase()))
              .map((cmd, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    cmd.action();
                    setIsPaletteOpen(false);
                    setPaletteSearch("");
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg text-xs font-semibold text-foreground/80 bg-card hover:bg-primary hover:text-white hover:shadow transition-all border border-border/40 flex justify-between items-center"
                >
                  <span>{cmd.label}</span>
                  <kbd className="text-[9px] px-1.5 py-0.5 bg-secondary text-foreground/60 rounded border border-border/80">
                    Enter
                  </kbd>
                </button>
              ))}
          </div>

          <div className="pt-2.5 border-t border-border flex justify-between text-[10px] text-muted-foreground">
            <span>Use Arrow keys or Click to execute</span>
            <span>Shortcut: <kbd className="bg-secondary px-1 py-0.5 rounded border">Cmd+K</kbd> or <kbd className="bg-secondary px-1 py-0.5 rounded border">/</kbd></span>
          </div>
        </div>
      </Dialog>

      {/* CRM DETAILS POPUP SLIDE OVER / DIALOG */}
      <Drawer
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={selectedOrder ? `CRM Order Card: #${selectedOrder.orderNumber}` : ""}
      >
        {selectedOrder && (
          <div className="space-y-6">
            {/* Status & Brand Header Bar */}
            <div className="flex items-center justify-between border-b border-border/50 pb-4">
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Verification Status</span>
                <div className="mt-1">
                  <Badge
                    variant={
                      selectedOrder.confirmationStatus === "confirmed" || selectedOrder.confirmationStatus === "delivered"
                        ? "success"
                        : ["cancelled", "fraud"].includes(selectedOrder.confirmationStatus)
                        ? "danger"
                        : "warning"
                    }
                    pulse={["new", "whatsapp_sent"].includes(selectedOrder.confirmationStatus)}
                  >
                    {STATUS_LABELS[selectedOrder.confirmationStatus] || selectedOrder.confirmationStatus}
                  </Badge>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Source Store</span>
                <p className="text-xs font-black text-indigo-500 mt-1 uppercase tracking-wider">
                  {clients.find((c) => c.id === selectedOrder.clientId)?.name || "VeriCRM Brand"}
                </p>
              </div>
            </div>

            {/* Core Info Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Customer Profile Card */}
              <div className="bg-secondary/25 p-4 rounded-xl border border-border/80 flex flex-col justify-between hover:border-border transition-colors">
                <div>
                  <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                    <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Customer Profile</span>
                  </div>
                  <h4 className="font-extrabold text-foreground text-sm">{selectedOrder.customerName}</h4>
                  <p className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    <span className="block font-medium text-foreground/80">{selectedOrder.phone}</span>
                    <span className="block truncate">{selectedOrder.email || "No email provided"}</span>
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-border/40 flex gap-2">
                  <a
                    href={`tel:${selectedOrder.phone}`}
                    className="text-[10px] font-bold text-indigo-500 hover:text-indigo-600 transition-colors flex items-center gap-1"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    Call Client
                  </a>
                </div>
              </div>

              {/* Shipping Address Card */}
              <div className="bg-secondary/25 p-4 rounded-xl border border-border/80 flex flex-col justify-between hover:border-border transition-colors">
                <div>
                  <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                    <svg className="h-4 w-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Shipping Address</span>
                  </div>
                  <p className="text-xs text-foreground mt-0.5 leading-relaxed font-medium">
                    {selectedOrder.address}
                  </p>
                  <p className="text-xs text-muted-foreground leading-normal mt-0.5">
                    {selectedOrder.city}, {selectedOrder.state} - {selectedOrder.country}
                  </p>
                </div>
                <div className="mt-3 pt-2.5 border-t border-border/40">
                  <button
                    onClick={() =>
                      copyAddressToClipboard(
                        `${selectedOrder.customerName}, ${selectedOrder.address}, ${selectedOrder.city}, ${selectedOrder.state}, ${selectedOrder.country}`
                      )
                    }
                    className="text-[10px] font-bold text-indigo-500 hover:text-indigo-600 transition-colors flex items-center gap-1"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    Copy Address Details
                  </button>
                </div>
              </div>
            </div>



            {/* Line Items / Invoice Receipt */}
            <div className="bg-secondary/35 p-5 rounded-xl border border-border/80">
              <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                <svg className="h-4.5 w-4.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-wider">Ordered Products</span>
              </div>
              <div className="divide-y divide-border/60">
                {selectedOrder.products.map((p, idx) => (
                  <div key={idx} className="flex justify-between py-3 text-xs items-center">
                    <div>
                      <div className="font-extrabold text-foreground flex items-center gap-1.5">
                        {p.name}
                        <span className="px-1.5 py-0.5 rounded-full bg-secondary text-foreground text-[10px] font-bold border border-border">
                          x{p.qty}
                        </span>
                      </div>
                      <div className="text-[9px] text-muted-foreground font-semibold mt-0.5">
                        Variant: {p.variant || "Default"}
                      </div>
                    </div>
                    <span className="font-bold text-foreground">₹{p.price * p.qty}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-black text-sm pt-4 border-t border-border/80 mt-2.5">
                <span className="text-muted-foreground">Total Invoice</span>
                <span className="text-foreground text-base">₹{selectedOrder.totalAmount}</span>
              </div>
            </div>

            {/* WHATSAPP CLICK TO CHAT GATEWAY */}
            {user?.role !== "client_viewer" && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 p-5 rounded-xl space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    WhatsApp Click-to-Chat Gateway
                  </span>
                  {clients.find((c) => c.id === selectedOrder.clientId)?.whatsappTemplates && (
                    <select
                      className="text-xs bg-card border border-border rounded-lg px-2.5 py-1 text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold"
                      value={selectedTemplateId}
                      onChange={(e) => handleTemplateChange(e.target.value, selectedOrder)}
                    >
                      {clients
                        .find((c) => c.id === selectedOrder.clientId)
                        ?.whatsappTemplates?.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>

                <textarea
                  className="w-full text-xs p-3 bg-card border border-border rounded-lg text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed"
                  rows={4}
                  value={customMsgContent}
                  onChange={(e) => setCustomMsgContent(e.target.value)}
                />

                <Button
                  variant="default"
                  size="md"
                  className="bg-[#25D366] hover:bg-[#20ba5a] text-white w-full text-xs font-bold flex items-center justify-center gap-2 shadow-sm shadow-emerald-500/10 active:scale-[0.98] border-none"
                  onClick={() => handleSendWhatsApp(selectedOrder)}
                >
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.513 2.262 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.73-1.45L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.623-1.023-5.086-2.884-6.949-1.864-1.864-4.341-2.89-6.969-2.891-5.439 0-9.863 4.37-9.867 9.8-.001 1.73.457 3.415 1.328 4.937l-.988 3.596 3.691-.948z" />
                  </svg>
                  Launch Official WhatsApp Web & Log
                </Button>
              </div>
            )}

            {/* WORKFLOW CONTROLS ACTIONS */}
            {user?.role !== "client_viewer" && (
              <div className="flex gap-3 border-t border-border pt-4">
                <Button
                  variant="destructive"
                  className="flex-1 text-xs font-bold py-2.5"
                  isLoading={isUpdatingOrder}
                  onClick={() => handleUpdateStatus(selectedOrder.id, "cancelled")}
                >
                  Mark Cancelled
                </Button>
                <Button
                  variant="default"
                  className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5"
                  isLoading={isUpdatingOrder}
                  onClick={() => handleUpdateStatus(selectedOrder.id, "confirmed")}
                >
                  Confirm Order Verification
                </Button>
              </div>
            )}

            {/* CRM ACTIVITY TIMELINE AND NOTES */}
            <div className="border-t border-border pt-4 space-y-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <svg className="h-4.5 w-4.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-wider">Internal Notes & Timeline Audit</span>
              </div>

              {/* Add Comment Note Form */}
              {user?.role !== "client_viewer" && (
                <form onSubmit={handleAddNote} className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 h-9 rounded-lg border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Add operational notes or comments..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                  />
                  <Button type="submit" size="sm" isLoading={isUpdatingOrder}>
                    Comment
                  </Button>
                </form>
              )}

              {/* Notes list */}
              {selectedOrder.notes && selectedOrder.notes.length > 0 && (
                <div className="space-y-2">
                  {selectedOrder.notes.map((n, idx) => (
                    <div key={idx} className="p-3 bg-secondary/35 rounded-lg border border-border/50 text-xs shadow-sm">
                      <div className="flex justify-between font-bold text-foreground mb-1">
                        <span className="text-primary">{n.author}</span>
                        <span className="text-[9px] text-muted-foreground font-normal">
                          {n.timestamp?.toDate ? n.timestamp.toDate().toLocaleString() : new Date(n.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-muted-foreground leading-relaxed font-medium">{n.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Real-time Timeline logs */}
              <div className="space-y-3 pt-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-foreground/75 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  Audit Timeline History
                </h4>
                <div className="relative pl-4 border-l border-border/80 ml-2 space-y-4">
                  {timelineLogs.map((log) => (
                    <div key={log.id} className="relative text-xs">
                      {/* Timeline dot */}
                      <span className="absolute -left-[21px] top-1 flex h-2 w-2 rounded-full bg-primary ring-4 ring-background" />
                      <div className="font-extrabold text-foreground text-[10px] uppercase tracking-wider">
                        {log.action?.replace(/_/g, " ")}
                      </div>
                      <p className="text-muted-foreground mt-0.5 leading-relaxed">{log.description}</p>
                      <div className="text-[9px] text-muted-foreground mt-1 font-semibold">
                        By {log.performedBy} •{" "}
                        {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : new Date(log.timestamp).toLocaleString()}
                      </div>
                    </div>
                  ))}
                  {timelineLogs.length === 0 && (
                    <div className="text-[10px] text-muted-foreground">
                      No system log entries generated yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* SHOPIFY ORDERS CSV IMPORT MODAL */}
      <Dialog
        isOpen={isImportOpen}
        onClose={() => {
          setIsImportOpen(false);
          setCsvFile(null);
          setParsedOrdersList([]);
          setParsedOrdersCount(null);
        }}
        title={`Import Shopify Orders: ${clients.find((c) => c.id === currentClientId)?.name || ""}`}
      >
        <div className="space-y-4">
          <div className="p-4 bg-secondary/30 rounded-lg border border-border text-xs text-muted-foreground leading-relaxed">
            <h4 className="font-bold text-foreground mb-1">Standard Shopify CSV Format Rules:</h4>
            <ul className="list-disc pl-4 space-y-1">
              <li>Export your orders CSV directly from your Shopify store admin panel.</li>
              <li>Required columns: <strong>Name</strong> (Order number), <strong>Total</strong>, <strong>Lineitem name</strong>, and <strong>Lineitem quantity</strong>.</li>
              <li>We will automatically parse delivery contacts and payment methods (Cash on Delivery / Prepaid) from the orders sheet.</li>
              <li>Duplicate orders with existing IDs in the database will be skipped automatically during processing.</li>
            </ul>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-foreground/80 uppercase tracking-wider">
              Select Shopify Orders CSV File
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm file:border-0 file:bg-transparent file:text-xs file:font-semibold file:text-primary hover:file:underline cursor-pointer focus:outline-none"
            />
          </div>

          {parsedOrdersCount !== null && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 font-semibold rounded-lg flex items-center justify-between">
              <span>Parsed {parsedOrdersCount} distinct order tickets from file!</span>
              <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded-full">Valid</span>
            </div>
          )}

          <div className="pt-3 border-t border-border flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsImportOpen(false);
                setCsvFile(null);
                setParsedOrdersList([]);
                setParsedOrdersCount(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              isLoading={isImporting}
              disabled={parsedOrdersList.length === 0}
              onClick={handleImportOrders}
            >
              Confirm Import ({parsedOrdersList.length})
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
