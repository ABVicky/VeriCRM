"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect } from "react";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { RealtimeSync, playNotificationChime } from "@/components/providers/RealtimeSync";
import { useStore, Notification } from "@/store/useStore";
import dynamicImport from "next/dynamic";

const OrdersView = dynamicImport(() => import("@/components/views/OrdersView").then((mod) => mod.OrdersView), {
  loading: () => <div className="text-center py-12 text-sm text-muted-foreground animate-pulse font-semibold uppercase tracking-widest">Loading Orders Dashboard...</div>,
});
const ClientsView = dynamicImport(() => import("@/components/views/ClientsView").then((mod) => mod.ClientsView), {
  loading: () => <div className="text-center py-12 text-sm text-muted-foreground animate-pulse font-semibold uppercase tracking-widest">Loading Connected Brands...</div>,
});
const TeamView = dynamicImport(() => import("@/components/views/TeamView").then((mod) => mod.TeamView), {
  loading: () => <div className="text-center py-12 text-sm text-muted-foreground animate-pulse font-semibold uppercase tracking-widest">Loading Access Control...</div>,
});
const AnalyticsView = dynamicImport(() => import("@/components/views/AnalyticsView").then((mod) => mod.AnalyticsView), {
  loading: () => <div className="text-center py-12 text-sm text-muted-foreground animate-pulse font-semibold uppercase tracking-widest">Loading Performance Metrics...</div>,
});
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { doc, updateDoc, writeBatch, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

function AppShellContent() {
  const {
    user,
    clients,
    currentClientId,
    setCurrentClientId,
    notifications,
    logout,
  } = useStore();

  const { toast } = useToast();

  const [activeView, setActiveView] = useState<"orders" | "clients" | "team" | "analytics">("orders");
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Default to light mode; restore user preference if saved
  useEffect(() => {
    const savedTheme = localStorage.getItem("vericrm_theme");
    if (savedTheme === "dark") {
      setIsDarkMode(true);
      window.document.documentElement.classList.add("dark");
    } else {
      setIsDarkMode(false);
      window.document.documentElement.classList.remove("dark");
    }
  }, []);

  const handleToggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      const root = window.document.documentElement;
      if (next) {
        root.classList.add("dark");
        localStorage.setItem("vericrm_theme", "dark");
      } else {
        root.classList.remove("dark");
        localStorage.setItem("vericrm_theme", "light");
      }
      return next;
    });
  };

  // Logout handler
  const handleLogout = async () => {
    try {
      await signOut(auth);
      logout();
      toast("Successfully signed out", "info");
    } catch (err) {
      toast("Failed to sign out", "error");
    }
  };

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    try {
      const unreadNotifications = notifications.filter((n) => !n.read);
      if (unreadNotifications.length === 0) return;

      const batch = writeBatch(db);
      unreadNotifications.forEach((n) => {
        const ref = doc(db, "notifications", n.id);
        batch.update(ref, { read: true });
      });

      await batch.commit();
      toast("All alerts marked read", "success");
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = async (notif: Notification) => {
    try {
      // Mark clicked notification as read
      const ref = doc(db, "notifications", notif.id);
      await updateDoc(ref, { read: true });

      // Open detail view for that order
      // We first lookup the order from firestore or store, then open OrdersView
      const ordersRef = collection(db, "orders");
      const q = query(ordersRef, where("id", "==", notif.orderId));
      const querySnap = await getDocs(q);

      if (!querySnap.empty) {
        // Toggle view to orders tab
        setActiveView("orders");
        setIsNotificationOpen(false);
        // Note: In OrdersView, they will see the synced order details.
        toast("Navigating to new order card...", "success");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen flex bg-background text-foreground transition-colors duration-200">
      {/* MOBILE DRAWER SIDEBAR */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          {/* Drawer Content */}
          <aside className="relative w-64 h-full bg-card border-r border-border p-6 flex flex-col justify-between z-10 glass-panel animate-in slide-in-from-left duration-200">
            <div className="space-y-6">
              {/* Header with Close Button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-foreground to-indigo-400 bg-clip-text text-transparent">
                      VeriCRM
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Active Brand Selector */}
              <div className="space-y-1.5">
                <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                  Active Client Store
                </label>
                <select
                  className="w-full h-9 rounded-lg border border-border bg-secondary/50 px-3 text-xs text-foreground font-semibold cursor-pointer focus:outline-none"
                  value={currentClientId || ""}
                  onChange={(e) => {
                    setCurrentClientId(e.target.value || null);
                    setIsMobileMenuOpen(false);
                  }}
                >
                  <option value="">All Managed Stores</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Navigation Links */}
              <nav className="space-y-1 pt-2">
                <button
                  onClick={() => { setActiveView("orders"); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    activeView === "orders" ? "bg-primary text-primary-foreground shadow shadow-primary/25" : "text-foreground/75 hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Order Dashboard
                </button>

                <button
                  onClick={() => { setActiveView("clients"); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    activeView === "clients" ? "bg-primary text-primary-foreground shadow shadow-primary/25" : "text-foreground/75 hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Connected Brands
                </button>

                {user?.role === "super_admin" && (
                  <button
                    onClick={() => { setActiveView("team"); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                      activeView === "team" ? "bg-primary text-primary-foreground shadow shadow-primary/25" : "text-foreground/75 hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    Team Access Roles
                  </button>
                )}

                <button
                  onClick={() => { setActiveView("analytics"); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    activeView === "analytics" ? "bg-primary text-primary-foreground shadow shadow-primary/25" : "text-foreground/75 hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  CRM Analytics
                </button>
              </nav>
            </div>

            {/* Account Info */}
            <div className="pt-4 border-t border-border space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center font-bold text-xs uppercase text-primary border border-border">
                  {user?.displayName?.substring(0, 2) || "US"}
                </div>
                <div className="overflow-hidden">
                  <h4 className="text-xs font-bold text-foreground truncate">{user?.displayName}</h4>
                  <Badge variant="purple" className="text-[9px] px-1.5 py-0.5 mt-0.5 leading-none">
                    {user?.role?.replace("_", " ")}
                  </Badge>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleLogout}>
                Logout Account
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* SIDEBAR NAVIGATION PANEL */}
      <aside className="hidden md:flex w-64 border-r border-border bg-card shrink-0 flex flex-col justify-between p-6 z-10 glass-panel">
        <div className="space-y-6">
          {/* Platform Branding */}
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-foreground to-indigo-400 bg-clip-text text-transparent">
                VeriCRM
              </span>
              <p className="text-[9px] text-muted-foreground uppercase font-semibold tracking-wider leading-none">
                ecommerce Verification
              </p>
            </div>
          </div>

          {/* ACTIVE TENANT STORE SELECTOR */}
          <div className="space-y-1.5">
            <label className="block text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
              Active Client Store
            </label>
            <select
              className="w-full h-9 rounded-lg border border-border bg-secondary/50 px-3 text-xs text-foreground font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
              value={currentClientId || ""}
              onChange={(e) => setCurrentClientId(e.target.value || null)}
            >
              <option value="">All Managed Stores</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Navigation tab links */}
          <nav className="space-y-1 pt-4">
            <button
              onClick={() => setActiveView("orders")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeView === "orders" ? "bg-primary text-primary-foreground shadow shadow-primary/25" : "text-foreground/75 hover:bg-secondary hover:text-foreground"
              }`}
            >
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Order Dashboard
            </button>

            <button
              onClick={() => setActiveView("clients")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeView === "clients" ? "bg-primary text-primary-foreground shadow shadow-primary/25" : "text-foreground/75 hover:bg-secondary hover:text-foreground"
              }`}
            >
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Connected Brands
            </button>

            {user?.role === "super_admin" && (
              <button
                onClick={() => setActiveView("team")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                  activeView === "team" ? "bg-primary text-primary-foreground shadow shadow-primary/25" : "text-foreground/75 hover:bg-secondary hover:text-foreground"
                }`}
              >
                <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Team Access Roles
              </button>
            )}

            <button
              onClick={() => setActiveView("analytics")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeView === "analytics" ? "bg-primary text-primary-foreground shadow shadow-primary/25" : "text-foreground/75 hover:bg-secondary hover:text-foreground"
              }`}
            >
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              CRM Analytics
            </button>
          </nav>
        </div>

        {/* User Account panel */}
        <div className="pt-4 border-t border-border space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center font-bold text-xs uppercase text-primary border border-border">
              {user?.displayName?.substring(0, 2) || "US"}
            </div>
            <div className="overflow-hidden">
              <h4 className="text-xs font-bold text-foreground leading-tight truncate">
                {user?.displayName}
              </h4>
              <Badge variant="purple" className="text-[9px] px-1.5 py-0.5 mt-0.5 leading-none">
                {user?.role?.replace("_", " ")}
              </Badge>
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleLogout}>
            Logout Account
          </Button>
        </div>
      </aside>

      {/* MAIN FRAME */}
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto">
        {/* Top Header Navbar */}
        <header className="h-16 border-b border-border bg-card/60 backdrop-blur-md flex items-center justify-between px-4 md:px-8 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 text-foreground/60 hover:text-foreground rounded-lg hover:bg-secondary md:hidden transition-colors"
              title="Open menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-md font-bold tracking-tight text-foreground/90 uppercase">
              {activeView}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Soft chime play testing */}
            <button
              onClick={playNotificationChime}
              className="p-2 text-foreground/60 hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
              title="Test Sound alerts chime"
            >
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            </button>

            {/* Dark/Light mode theme switch */}
            <button
              onClick={handleToggleTheme}
              className="p-2 text-foreground/60 hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
              title="Toggle Dark/Light mode theme"
            >
              {isDarkMode ? (
                <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z" />
                </svg>
              ) : (
                <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* Notifications Alert Center */}
            <div className="relative">
              <button
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                className="p-2 text-foreground/60 hover:text-foreground rounded-lg hover:bg-secondary transition-colors relative"
              >
                <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                )}
              </button>

              {/* Notification Drawer panel dropdown */}
              {isNotificationOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl glass-panel p-4 shadow-2xl z-50 border border-border animate-in fade-in-10 slide-in-from-top-2 duration-150">
                  <div className="flex items-center justify-between border-b border-border pb-2 mb-2">
                    <span className="text-xs font-bold text-foreground">Operational Alerts</span>
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[10px] font-semibold text-primary hover:underline"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {notifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                          notif.read ? "bg-card border-border text-muted-foreground" : "bg-primary/5 border-primary/20 text-foreground font-semibold hover:bg-primary/10"
                        }`}
                      >
                        <div className="leading-relaxed">{notif.message}</div>
                        <div className="text-[9px] text-muted-foreground mt-1">
                          {notif.createdAt?.toDate ? notif.createdAt.toDate().toLocaleTimeString() : new Date(notif.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                    {notifications.length === 0 && (
                      <div className="text-center py-6 text-xs text-muted-foreground">
                        No alerts logged.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* View Tabs router mounting */}
        <div className="flex-1 p-4 md:p-8">
          {activeView === "orders" && <OrdersView />}
          {activeView === "clients" && <ClientsView />}
          {activeView === "team" && <TeamView />}
          {activeView === "analytics" && <AnalyticsView />}
        </div>
      </main>
    </div>
  );
}

export default function HomePage() {
  return (
    <ToastProvider>
      <AuthProvider>
        <RealtimeSync>
          <AppShellContent />
        </RealtimeSync>
      </AuthProvider>
    </ToastProvider>
  );
}
