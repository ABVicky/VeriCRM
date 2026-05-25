"use client";

import React, { useEffect, useRef } from "react";
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useStore, Order, Notification, ClientStore } from "@/store/useStore";

// Synthesise an elegant alert chime using browser Web Audio API
export const playNotificationChime = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    
    // Node 1: Oscillator (Sine wave for soft bell tone)
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    
    // Tone structure: D5 (587.33 Hz) slurs up to A5 (880.00 Hz)
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc1.frequency.setValueAtTime(880.0, ctx.currentTime + 0.08);

    // Node 2: Gain Node (Volume envelope control)
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

    osc1.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc1.stop(ctx.currentTime + 0.55);
  } catch (error) {
    console.error("Web Audio synthesis block:", error);
  }
};

export const RealtimeSync: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const {
    user,
    currentClientId,
    setOrders,
    setNotifications,
    setClients,
    ordersLimitCount,
  } = useStore();

  const isInitialLoad = useRef(true);
  const previousOrderCount = useRef(0);

  // 1. Sync Clients list
  useEffect(() => {
    if (!user) return;

    const clientsRef = collection(db, "clients");
    let clientsQuery;

    if (user.role === "super_admin") {
      clientsQuery = query(clientsRef);
    } else {
      if (user.clientIds.length === 0) {
        setClients([]);
        return;
      }
      // Query specific clients
      clientsQuery = query(clientsRef, where("id", "in", user.clientIds));
    }

    const unsubscribe = onSnapshot(
      clientsQuery,
      (snapshot) => {
        const loadedClients: ClientStore[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name,
            logoUrl: data.logoUrl,
            shopifyDomain: data.shopifyDomain,
            shopifyWebhookSecret: data.shopifyWebhookSecret,
            whatsappTemplates: data.whatsappTemplates || [],
            whatsappGroupUrl: data.whatsappGroupUrl || "",
            staffIds: data.staffIds || [],
            status: data.status || "active",
            createdAt: data.createdAt,
          };
        });
        setClients(loadedClients);
      },
      (error) => {
        console.error("Firestore Clients Listen error:", error);
      }
    );

    return () => unsubscribe();
  }, [user, setClients]);

  // 2. Sync Orders List (Realtime dashboard updates)
  useEffect(() => {
    if (!user) return;

    const ordersRef = collection(db, "orders");
    let ordersQuery;

    // Filter queries based on selected store and user rights
    if (currentClientId) {
      ordersQuery = query(
        ordersRef,
        where("clientId", "==", currentClientId),
        orderBy("timestamps.created", "desc"),
        limit(ordersLimitCount)
      );
    } else {
      // If "All Stores" is selected:
      if (user.role === "super_admin") {
        ordersQuery = query(ordersRef, orderBy("timestamps.created", "desc"), limit(ordersLimitCount));
      } else {
        if (user.clientIds.length === 0) {
          setOrders([]);
          return;
        }
        ordersQuery = query(
          ordersRef,
          where("clientId", "in", user.clientIds),
          orderBy("timestamps.created", "desc"),
          limit(ordersLimitCount)
        );
      }
    }

    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const loadedOrders: Order[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            clientId: data.clientId,
            shopifyOrderId: data.shopifyOrderId,
            orderNumber: data.orderNumber,
            customerName: data.customerName,
            phone: data.phone,
            email: data.email,
            address: data.address,
            city: data.city,
            state: data.state,
            country: data.country,
            products: data.products || [],
            paymentMethod: data.paymentMethod,
            isCod: data.isCod || false,
            totalAmount: data.totalAmount || 0,
            notes: data.notes || [],
            tags: data.tags || [],
            fulfillmentStatus: data.fulfillmentStatus,
            timestamps: data.timestamps,
            confirmationStatus: data.confirmationStatus || "new",
            riskScore: data.riskScore || 0,
            duplicateOrderIds: data.duplicateOrderIds || [],
            assignedStaffId: data.assignedStaffId || "",
          };
        });

        // Trigger chime sound for new incoming orders
        if (!isInitialLoad.current) {
          if (loadedOrders.length > previousOrderCount.current) {
            // Find if there is a new order
            playNotificationChime();
          }
        } else {
          isInitialLoad.current = false;
        }

        previousOrderCount.current = loadedOrders.length;
        setOrders(loadedOrders);
      },
      (error) => {
        console.error("Firestore Orders Listen error:", error);
      }
    );

    return () => unsubscribe();
  }, [user, currentClientId, setOrders, ordersLimitCount]);

  // 3. Sync Notifications list
  useEffect(() => {
    if (!user) return;

    const notificationsRef = collection(db, "notifications");
    let notifyQuery;

    if (currentClientId) {
      notifyQuery = query(
        notificationsRef,
        where("clientId", "==", currentClientId),
        orderBy("createdAt", "desc"),
        limit(50)
      );
    } else {
      if (user.role === "super_admin") {
        notifyQuery = query(notificationsRef, orderBy("createdAt", "desc"), limit(50));
      } else {
        if (user.clientIds.length === 0) {
          setNotifications([]);
          return;
        }
        notifyQuery = query(
          notificationsRef,
          where("clientId", "in", user.clientIds),
          orderBy("createdAt", "desc"),
          limit(50)
        );
      }
    }

    const unsubscribe = onSnapshot(
      notifyQuery,
      (snapshot) => {
        const loadedNotifications: Notification[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            clientId: data.clientId,
            message: data.message,
            orderId: data.orderId,
            type: data.type || "new_order",
            read: data.read || false,
            createdAt: data.createdAt,
          };
        });
        setNotifications(loadedNotifications);
      },
      (error) => {
        console.error("Firestore Notifications Listen error:", error);
      }
    );

    return () => unsubscribe();
  }, [user, currentClientId, setNotifications]);

  return <>{children}</>;
};
