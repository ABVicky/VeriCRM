import { create } from "zustand";

export interface UserProfile {
  uid: string;
  email: string;
  role: "super_admin" | "staff" | "client_viewer";
  clientIds: string[];
  displayName?: string;
}

export interface WhatsappTemplate {
  id: string;
  name: string;
  language: string;
  message: string;
}

export interface ClientStore {
  id: string;
  name: string;
  logoUrl?: string;
  shopifyDomain: string;
  shopifyWebhookSecret?: string;
  shopifyAccessTokenEncrypted?: string;
  whatsappTemplates: WhatsappTemplate[];
  whatsappGroupUrl?: string;
  staffIds: string[];
  status: "active" | "inactive";
  createdAt: any;
}

export interface OrderItem {
  id: number;
  name: string;
  qty: number;
  variant: string;
  price: number;
}

export interface Order {
  id: string;
  clientId: string;
  shopifyOrderId: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  country: string;
  products: OrderItem[];
  paymentMethod: string;
  isCod: boolean;
  totalAmount: number;
  notes: Array<{ text: string; author: string; timestamp: any }>;
  tags: string[];
  fulfillmentStatus: string;
  timestamps: {
    created: any;
    updated: any;
    verified?: any;
    cancelled?: any;
    sync: any;
  };
  confirmationStatus:
    | "new"
    | "whatsapp_sent"
    | "awaiting_confirmation"
    | "confirmed"
    | "processing"
    | "shipped"
    | "delivered"
    | "cancelled"
    | "fraud";
  riskScore: number;
  duplicateOrderIds?: string[];
  assignedStaffId?: string;
}

export interface Notification {
  id: string;
  clientId: string;
  message: string;
  orderId: string;
  type: "new_order" | "high_risk" | "urgency";
  read: boolean;
  createdAt: any;
}

interface AppState {
  user: UserProfile | null;
  clients: ClientStore[];
  currentClientId: string | null; // null represents "All Stores"
  orders: Order[];
  notifications: Notification[];
  isLoading: boolean;
  ordersLimitCount: number;
  deepSearchedOrders: Order[];
  setUser: (user: UserProfile | null) => void;
  setClients: (clients: ClientStore[]) => void;
  setCurrentClientId: (id: string | null) => void;
  setOrders: (orders: Order[]) => void;
  setNotifications: (notifications: Notification[]) => void;
  setLoading: (loading: boolean) => void;
  increaseOrdersLimit: (amount: number) => void;
  setDeepSearchedOrders: (orders: Order[]) => void;
  logout: () => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  clients: [],
  currentClientId: null,
  orders: [],
  notifications: [],
  isLoading: true,
  ordersLimitCount: 100,
  deepSearchedOrders: [],
  setUser: (user) => set({ user }),
  setClients: (clients) => set({ clients }),
  setCurrentClientId: (id) => set({ currentClientId: id, ordersLimitCount: 100, deepSearchedOrders: [] }),
  setOrders: (orders) => set({ orders }),
  setNotifications: (notifications) => set({ notifications }),
  setLoading: (loading) => set({ isLoading: loading }),
  increaseOrdersLimit: (amount) => set((state) => ({ ordersLimitCount: state.ordersLimitCount + amount })),
  setDeepSearchedOrders: (orders) => set({ deepSearchedOrders: orders }),
  logout: () =>
    set({
      user: null,
      clients: [],
      currentClientId: null,
      orders: [],
      notifications: [],
      isLoading: false,
      ordersLimitCount: 100,
      deepSearchedOrders: [],
    }),
}));
