"use client";

import React, { useMemo } from "react";
import { useStore } from "@/store/useStore";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export const AnalyticsView: React.FC = () => {
  const { orders, clients } = useStore();

  const stats = useMemo(() => {
    const total = orders.length;
    const confirmed = orders.filter((o) => o.confirmationStatus === "confirmed" || o.confirmationStatus === "delivered" || o.confirmationStatus === "shipped" || o.confirmationStatus === "processing").length;
    const cancelled = orders.filter((o) => o.confirmationStatus === "cancelled").length;
    const pending = orders.filter((o) => ["new", "whatsapp_sent", "awaiting_confirmation"].includes(o.confirmationStatus)).length;

    // COD stats
    const codOrders = orders.filter((o) => o.isCod);
    const codTotal = codOrders.length;
    const codConfirmed = codOrders.filter((o) => ["confirmed", "delivered", "shipped", "processing"].includes(o.confirmationStatus)).length;
    const codSuccessRate = codTotal > 0 ? Math.round((codConfirmed / codTotal) * 100) : 0;

    // Confirmation / Cancellation rates
    const resolvedCount = confirmed + cancelled;
    const confirmationRate = resolvedCount > 0 ? Math.round((confirmed / resolvedCount) * 100) : 0;
    const cancellationRate = resolvedCount > 0 ? Math.round((cancelled / resolvedCount) * 100) : 0;

    // Daily volume
    const dailyMap: { [key: string]: { date: string; volume: number; verified: number } } = {};
    orders.forEach((o) => {
      let dateStr = "Unknown";
      if (o.timestamps?.created) {
        const d = o.timestamps.created.toDate ? o.timestamps.created.toDate() : new Date(o.timestamps.created);
        dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      }
      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = { date: dateStr, volume: 0, verified: 0 };
      }
      dailyMap[dateStr].volume += 1;
      if (["confirmed", "delivered", "shipped", "processing"].includes(o.confirmationStatus)) {
        dailyMap[dateStr].verified += 1;
      }
    });

    const dailyData = Object.values(dailyMap).reverse().slice(-10); // Last 10 days

    // Store breakdown
    const storeMap: { [key: string]: { name: string; value: number } } = {};
    orders.forEach((o) => {
      const client = clients.find((c) => c.id === o.clientId);
      const name = client ? client.name : "Unknown Brand";
      if (!storeMap[o.clientId]) {
        storeMap[o.clientId] = { name, value: 0 };
      }
      storeMap[o.clientId].value += 1;
    });
    const storeData = Object.values(storeMap);

    return {
      total,
      confirmed,
      cancelled,
      pending,
      codSuccessRate,
      confirmationRate,
      cancellationRate,
      dailyData,
      storeData,
    };
  }, [orders, clients]);

  const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Total Orders */}
        <div className="glass-panel p-6 rounded-xl border border-border shadow-sm hover:border-indigo-500/30 transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 h-24 w-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors" />
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              Total Synced
            </p>
            <span className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </span>
          </div>
          <p className="text-4xl font-black mt-2 tracking-tight text-foreground">{stats.total}</p>
          <div className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5 font-medium">
            <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-foreground font-semibold">{stats.pending}</span> pending verification
          </div>
        </div>

        {/* Card 2: Verification Rate */}
        <div className="glass-panel p-6 rounded-xl border border-border shadow-sm hover:border-emerald-500/30 transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 h-24 w-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors" />
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              Verification Rate
            </p>
            <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </span>
          </div>
          <p className="text-4xl font-black mt-2 tracking-tight text-emerald-500">{stats.confirmationRate}%</p>
          <div className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5 font-medium">
            <span className="text-emerald-500 font-bold">{stats.confirmed}</span> confirmed
            <span className="text-border">|</span>
            <span className="text-rose-500 font-bold">{stats.cancelled}</span> cancelled
          </div>
        </div>

        {/* Card 3: COD Verification Coverage */}
        <div className="glass-panel p-6 rounded-xl border border-border shadow-sm hover:border-violet-500/30 transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 h-24 w-24 bg-violet-500/5 rounded-full blur-2xl group-hover:bg-violet-500/10 transition-colors" />
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              COD Coverage
            </p>
            <span className="p-2 rounded-lg bg-violet-500/10 text-violet-500 border border-violet-500/20">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </span>
          </div>
          <p className="text-4xl font-black mt-2 tracking-tight text-violet-500">{stats.codSuccessRate}%</p>
          <div className="text-xs text-muted-foreground mt-3 font-medium">
            Rate of COD orders verified before shipping
          </div>
        </div>
      </div>

      {/* Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Order Volume Area Chart */}
        <div className="glass-panel p-6 rounded-xl border border-border shadow-sm lg:col-span-2">
          <h3 className="text-sm font-bold tracking-wide uppercase mb-4 text-foreground/80 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-indigo-500" />
            Daily Order Volume (Last 10 Days)
          </h3>
          <div className="h-80">
            {stats.dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.dailyData}>
                  <defs>
                    <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorVerified" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.15} />
                  <XAxis dataKey="date" stroke="var(--muted)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderRadius: "12px",
                      border: "1px solid var(--border)",
                      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                      color: "var(--foreground)",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                  <Area
                    name="Total Received"
                    type="monotone"
                    dataKey="volume"
                    stroke="#6366f1"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorVolume)"
                  />
                  <Area
                    name="Confirmed"
                    type="monotone"
                    dataKey="verified"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorVerified)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                No historical daily metrics available.
              </div>
            )}
          </div>
        </div>

        {/* Client Store Share breakdown Bar Chart */}
        <div className="glass-panel p-6 rounded-xl border border-border shadow-sm">
          <h3 className="text-sm font-bold tracking-wide uppercase mb-4 text-foreground/80 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-violet-500" />
            Order Share by Connected Brand
          </h3>
          <div className="h-80">
            {stats.storeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.storeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.15} />
                  <XAxis dataKey="name" stroke="var(--muted)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderRadius: "12px",
                      border: "1px solid var(--border)",
                      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                      color: "var(--foreground)",
                    }}
                  />
                  <Bar dataKey="value" name="Total Orders" radius={[6, 6, 0, 0]}>
                    {stats.storeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                No active store data synced.
              </div>
            )}
          </div>
        </div>

        {/* Operational Efficiency metrics */}
        <div className="glass-panel p-6 rounded-xl border border-border shadow-sm">
          <h3 className="text-sm font-bold tracking-wide uppercase mb-4 text-foreground/80 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Operational Efficiency
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  Verified Ratio
                </span>
                <span className="text-indigo-500 font-black">{stats.confirmationRate}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-500 rounded-full"
                  style={{ width: `${stats.confirmationRate}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  COD Verification Coverage
                </span>
                <span className="text-emerald-500 font-black">{stats.codSuccessRate}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-500 rounded-full"
                  style={{ width: `${stats.codSuccessRate}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
