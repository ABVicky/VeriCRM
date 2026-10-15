# VeriCRM - Ecommerce Order Verification & Operational CRM

VeriCRM is a production-grade, multi-tenant SaaS platform built for ecommerce agencies and freelancers who manage multiple Shopify brand stores. It focuses on reducing Cash-on-Delivery (COD) refusal and return-to-origin (RTO) rates by automating customer order verification workflows, flagging high-risk orders, detecting duplicates, and enabling single-click WhatsApp Click-to-Chat operations.

---

## Technical Architecture

* **Frontend**: Next.js 15 App Router, TypeScript, TailwindCSS, Zustand (State Management), Framer Motion (Animations), Recharts (Visual Analytics).
* **Backend Layer**: Next.js serverless API routes authenticated using Firebase Admin SDK.
* **Database & Auth**: Firebase Firestore (Multi-tenant scoped), Firebase Authentication, Firebase Storage.
* **Integrations**: Shopify Admin REST/Webhook API, WhatsApp Click-to-Chat.

---

## Project Folder Structure

```
├── src/
│   ├── app/                      # Next.js App Router Pages & APIs
│   │   ├── api/                  # Server API endpoints
│   │   │   ├── auth/profile/     # User profile sync
│   │   │   ├── clients/          # Client brand CRUD & manual order sync
│   │   │   ├── orders/           # Order actions & WhatsApp tracking logs
│   │   │   ├── staff/            # Role assignments (Super Admin only)
│   │   │   └── webhooks/shopify/ # Shopify real-time webhook listener
│   │   ├── globals.css           # Premium CSS style systems & glassmorphism
│   │   ├── layout.tsx            # Global metadata & font styling
│   │   └── page.tsx              # App dashboard frame & views router
│   ├── components/
│   │   ├── providers/            # Auth gates & real-time Firestore sync
│   │   ├── ui/                   # Custom buttons, inputs, dialogs, badges, toasts
│   │   └── views/                # Tab components: Dashboard, Clients, Team, Analytics
│   ├── lib/                      # Firebase Client/Admin SDK, Webhook verify, Cryptography
│   └── store/                    # Zustand global application state store
├── firestore.rules               # Multi-tenant Firestore access constraints
├── vercel.json                   # Security headers for web hosting
└── tsconfig.json                 # TypeScript compiler configuration
```

---

## Production Deployment Checklist

### 1. Environment Variables Configuration

Create a `.env.local` file (for local testing) and configure these keys in Vercel and Firebase:

```env
# --- NEXT.JS PUBLIC FRONTEND KEYS ---
NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id

# --- SERVER-SIDE ADMIN PRIVATE KEYS ---
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7...\n-----END PRIVATE KEY-----\n"

# --- SHOPIFY API SECURITY ---
SHOPIFY_ENCRYPTION_KEY=32_character_long_secret_key_for_aes_gcm
SHOPIFY_WEBHOOK_SECRET=global_fallback_webhook_verification_secret
```

> [!NOTE]
> Ensure the `FIREBASE_PRIVATE_KEY` has its newline characters preserved as `\n` if pasting as a single line env variable in Vercel.

---

### 2. Firestore Setup

1. Create a Firebase Project on the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Firestore Database** in test or production mode.
3. Enable **Authentication** and activate the **Email/Password** sign-in provider.
4. Deploy the security rules by copying the contents of `firestore.rules` into the Firebase console Rules tab, or deploy via Firebase CLI:
   ```bash
   firebase deploy --only firestore:rules
   ```

#### Required Firestore Indexes
To support order sorting and filtering, configure the following composite index in Firestore:
* **Collection**: `orders`
  * Fields: `clientId` (Ascending), `timestamps.created` (Descending)
  * Scope: `Collection`

---

### 3. Shopify Direct Webhook Setup

VeriCRM allows connecting stores **directly via Shopify Webhooks** so orders stream in real-time the instant they are placed:

#### A. Webhook Credentials in VeriCRM:
When clicking **Connect Store** in VeriCRM:
1. Enter your **Brand Name** and **Shopify Store Domain** (e.g., `your-store.myshopify.com` or custom domain).
2. Enter your **Shopify Webhook Signing Secret**:
   - In Shopify Admin, navigate to **Settings > Notifications > Webhooks**.
   - Scroll to the bottom and copy the string under **"Your webhooks will be signed with: ..."** (or your Custom App API Secret Key).
   - Paste it into the **Shopify Webhook Secret** field in VeriCRM.
3. (Optional) Provide an **Admin API Access Token** (`shpat_...`) if you also want historical order imports or automatic API registration.

#### B. Configure Webhooks in Shopify Admin:
1. In Shopify Admin, open **Settings > Notifications > Webhooks**.
2. Click **Create webhook**:
   * **Event**: `Order creation` (`orders/create`)
   * **Format**: `JSON`
   * **URL**: `https://your-domain.com/api/webhooks/shopify` (or the store-specific URL `https://your-domain.com/api/webhooks/shopify?clientId=YOUR_CLIENT_ID`)
   * **API Version**: `2024-04` (or latest)
3. (Recommended) Repeat for **Order updated** (`orders/updated`) and **Order cancellation** (`orders/cancelled`).
4. Click **Save**.

#### C. Test Your Webhook Integration:
- On the **Client Brands** page, click the **Webhooks** button on your store card.
- Click **"Send Test Order Webhook"** to simulate a live order delivery and verify that it immediately appears in your CRM with sound notification!

---

## Local Development Instructions

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the local server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3000` in your web browser.

---

## Operational Features & Automated CRM Workflows

### 🛡️ Fraud & Risk Screening Engine
Incoming Shopify orders automatically receive a fraud risk score (0-100%) calculated upon arrival:
* **COD Payments**: Starts with a base of +10 risk index.
* **High-Ticket COD**: COD tickets exceeding ₹5000 add +20 risk index.
* **Invalid Contact Details**: Missing or short phone numbers add +30 risk index.
* **Suspicious Addresses**: Addresses containing placeholder strings like "test" or "fake" add +25 risk index.
* **Deduplication Check**: If the phone number placed another order in the last 24 hours, it flags a duplicate and adds +40 risk index.
* If risk score exceeds **75%**, the order is flagged as `fraud`, triggering a high-priority alert.

### 💬 WhatsApp click-to-chat Integration
1. Select an order card to open the CRM panel.
2. Select a template (configured in Client Brand settings). Placeholders are resolved dynamically in real-time.
3. Click "Open WhatsApp Web & Log". The system opens the WhatsApp pre-filled chat in a new tab, logs the outreach attempt to the timeline history, and sets status to `whatsapp_sent`.

### 👥 Staff Scopes & Roles
* **Super Admin**: Connect/disconnect brands, change staff assignments, edit global templates, and change user access levels.
* **Staff**: View assigned brands, execute WhatsApp confirmations, add timeline comments, and change order verification states.
* **Client Viewer**: Read-only access to assigned store stats and tables. Cannot modify configurations, notes, or verification states.
