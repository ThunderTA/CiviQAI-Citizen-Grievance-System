# CitizenCare

> AI-powered civic issue tracking & management platform connecting citizens with local authorities.

Citizens report problems. AI inspects & triages them. Admins resolve them. Everyone stays informed — in real time.

---

## 🌟 Key Features

### 👥 For Citizens

- **GPS Pin-Drop Reporting** — Drop a pinpoint on the interactive Leaflet map or tap **"Use Live GPS"** to auto-detect coordinates and reverse-geocode your address and state.
- **AI Vision Inspection** — Photos are analyzed by Groq Multimodal Vision to verify genuineness, detect physical hazards, tag defects (e.g. `#pothole`, `#water hazard`), and assess severity.
- **Similar Issue Warning** — Debounced search alerts you if a matching issue already exists before submission to prevent duplicates.
- **Smart SLA Countdown** — Track the live SLA clock and target completion window (e.g. 48h for High Priority) on your complaints.
- **Two-Way Official Discussion** — Live comments thread with municipal officials and department heads to provide extra details or ask questions.
- **Multi-Channel Alerts** — Instant notifications via **Email**, **SMS**, and **WhatsApp** when your complaint status changes or officials reply.
- **Before-vs-After Verification** — Inspect side-by-side proof photos with AI verification verdicts and completion scores upon resolution.
- **Satisfaction Rating** — Rate resolved issues with 1–5 stars and optional feedback.
- **Hyperlocal "Near Me" Feed** — Filter community issues within **1 km, 3 km, 5 km, 10 km, or 25 km** of your current location with live proximity tags (*"450 m away"*).
- **Profile & Civic Stats** — Personal dashboard showing resolution rate, category breakdown, and recent activity.

### 🏛️ For Main Admins

- **Global Issue Dashboard** — View, filter, sort, and search citizen issues across all departments.
- **SLA & Auto-Escalation Engine** — Issues that breach priority SLA deadlines are automatically flagged as **`🔴 Escalated`** for priority intervention.
- **Before-vs-After AI Inspector** — Upload resolution proof photos when marking issues resolved; AI instantly validates the repair against the original complaint.
- **Department Routing** — Route issues to specific municipal departments and assign department admins.
- **Bulk Operations** — Select multiple issues to update status, assign departments, or delete in batch.
- **Advanced Analytics** — Recharts visualizations for issue trends over time, category distributions, sentiment analysis, and resolution ratios.
- **CSV Data Export** — One-click download of filtered issues and SLA compliance data.
- **User Role Management** — Promote registered citizens to department administrators.

### 🏢 For Department Admins

- **Department Scoped Dashboard** — Scoped workspace showing only issues assigned to their department.
- **Resolution Proof Upload** — Upload "After" photos triggering automated AI verification and citizen notifications.
- **Two-Way Citizen Chat** — Post official updates and clarification queries to citizens.
- **Real-time Sync** — Socket.io live synchronization across all connected dashboards.

### 🌐 Public & Community

- **Dual-Mode Geospatial Map**:
  - **Live GPS Pin Map (Leaflet)**: Interactive map with colored status markers, clickable detail popups, SLA badges, and *"My Live Radar"* circle.
  - **State Density Heatmap (Choropleth)**: Pan-India choropleth map showing issue volume and drill-down by state.
- **Community Feed** — Public browse and upvoting with radius filtering and search.

---

## 🔐 Role-Based Access Control (RBAC)

| Role | How it's set | Capabilities |
| :--- | :--- | :--- |
| **Citizen** | Default on Clerk sign-up | Submit issues with GPS & photo, upvote, comment, rate resolutions, track SLA. |
| **Dept Admin** | Main Admin assigns via Users page | Update status/notes and upload resolution proof for their department's issues. |
| **Main Admin** | Email listed in `ADMIN_EMAILS` env var | Full global access — all departments, auto-escalations, analytics, user roles. |

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, Vite, Tailwind CSS v4, Lucide Icons, Shadcn/Radix UI |
| **Routing** | React Router v7 |
| **Auth** | Clerk (`@clerk/clerk-react` + `@clerk/clerk-sdk-node`) |
| **Real-time** | Socket.io |
| **Geospatial & Maps** | Leaflet, `react-leaflet`, `react-simple-maps` (GeoJSON Choropleth), OpenStreetMap Nominatim |
| **Backend** | Node.js (ES Modules), Express 4 |
| **Database** | MongoDB Atlas (Mongoose 8) |
| **AI & Vision** | Groq SDK (`llama-3.2-11b-vision-preview` & `llama-3.1-8b-instant`) |
| **Notifications** | Nodemailer (Email SMTP), Twilio / WhatsApp Cloud API / Multi-channel dispatcher |
| **Charts & Metrics** | Recharts, Vercel Analytics (`@vercel/analytics`) |

---

## 📁 Project Structure

```text
CitizenCare/
├── client/                               # Frontend (React 19 + Vite)
│   ├── public/
│   │   └── india-states.json             # India GeoJSON state boundaries
│   └── src/
│       ├── components/
│       │   ├── Navbar.jsx                # Role-aware navigation + notification bell
│       │   ├── LocationPicker.jsx        # Leaflet GPS map picker with reverse geocoding
│       │   ├── SLATimer.jsx              # Real-time SLA countdown & escalation clocks
│       │   ├── BeforeAfterViewer.jsx     # Side-by-side Before/After AI verification
│       │   ├── CommentSection.jsx        # Two-way conversation thread with role badges
│       │   ├── StatusTimeline.jsx        # Issue status lifecycle timeline
│       │   └── SocketNotifications.jsx   # Live WebSocket background listener
│       ├── contexts/
│       │   ├── NotificationContext.jsx   # In-app notifications state
│       │   └── RoleContext.jsx           # User role / department sync
│       ├── lib/
│       │   ├── api.js                    # Configured Axios instance
│       │   ├── socket.js                 # Socket.io client connection
│       │   └── utils.js                  # Tailwind utility helpers
│       ├── pages/
│       │   ├── LandingPage.jsx           # Product landing and hero page
│       │   ├── CitizenPortal.jsx         # GPS pin-drop submission + AI Vision feedback
│       │   ├── MyIssues.jsx              # Citizen issue tracker with SLA & ratings
│       │   ├── Feed.jsx                  # Community feed with "Near Me" radius radar
│       │   ├── IssueMap.jsx              # Dual Map: Live GPS Pins + State Choropleth
│       │   ├── Profile.jsx               # Citizen stats & scorecards
│       │   ├── AdminDashboard.jsx        # Master admin dashboard with SLA auto-escalation
│       │   ├── DeptDashboard.jsx         # Scoped department workspace
│       │   ├── Analytics.jsx             # Visualized data charts
│       │   └── UserManagement.jsx        # Admin user promotion tool
│       ├── App.jsx                       # Route layout and protection
│       └── main.jsx                      # App root with Leaflet styles
│
└── server/                               # Backend (Node.js + Express)
    ├── config/
    │   └── db.js                         # MongoDB connection
    ├── controllers/
    │   ├── aiController.js               # Groq Vision & LLM triage + Before/After verification
    │   ├── slaController.js              # SLA deadlines, auto-escalation & Haversine distance
    │   ├── emailController.js            # Nodemailer transactional email templates
    │   └── smsWhatsappController.js      # Multi-channel SMS & WhatsApp notification dispatcher
    ├── models/
    │   ├── Issue.js                      # Schema: coordinates, SLA, vision, verification, comments
    │   └── User.js                       # Schema: Clerk ID, role, department
    ├── routes/
    │   ├── auth.js                       # User sync & admin promotion endpoints
    │   └── issues.js                     # CRUD, radial filters, SLA, comments, votes, ratings
    └── server.js                         # Express entrypoint & Socket.io server
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ (LTS recommended)
- MongoDB Atlas cluster
- Clerk account
- Groq API key (for Vision & Text triage)
- Gmail account with App Password (for email alerts)

### 1. Clone the repository

```bash
git clone https://github.com/PRATYAKSH15/CitizenCare.git
cd CitizenCare
```

### 2. Configure and start the backend

```bash
cd server
npm install
```

Create `server/.env`:

```env
PORT=3000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/citizencare
CLERK_SECRET_KEY=sk_test_...
GROQ_API_KEY=gsk_...
CLIENT_URL=http://localhost:5173
ADMIN_EMAILS=admin@example.com,other@example.com
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_gmail_app_password

# Optional: Twilio / WhatsApp Cloud API credentials
# TWILIO_ACCOUNT_SID=...
# TWILIO_AUTH_TOKEN=...
# TWILIO_PHONE_NUMBER=...
# TWILIO_WHATSAPP_NUMBER=...
```

Start the backend:

```bash
npm run dev
```

### 3. Configure and start the frontend

In a new terminal:

```bash
cd ../client
npm install
```

Create `client/.env`:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_ADMIN_EMAILS=admin@example.com,other@example.com
VITE_API_URL=http://localhost:3000/api
VITE_MAPPLS_API_KEY=your_mappls_api_key
```

Start the frontend:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## 📡 API Endpoints Reference

### Issues

| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/issues` | Citizen | Submit new issue with GPS coordinates, photo, and phone alerts |
| `GET` | `/api/issues/my` | Citizen | Fetch citizen's submitted issues with live SLA countdowns |
| `GET` | `/api/issues/feed` | Public | Community feed (supports `lat`, `lng`, `radius` km filtering) |
| `GET` | `/api/issues/search` | Public | Search issues by keyword |
| `GET` | `/api/issues/public` | Public | All public issues with coordinates (for Leaflet and Choropleth map) |
| `GET` | `/api/issues` | Admin / Dept Admin | Filtered issue list (supports `escalated`, `status`, `department`, `radius`) |
| `PATCH` | `/api/issues/:id` | Admin / Dept Admin | Update status, note, or upload resolution "After" photo |
| `POST` | `/api/issues/:id/comments` | Authenticated | Post a comment/update to an issue's official thread |
| `POST` | `/api/issues/:id/verify-resolution` | Admin / Dept Admin | Trigger manual AI Before-vs-After resolution verification |
| `POST` | `/api/issues/:id/vote` | Authenticated | Upvote / remove upvote on an issue |
| `POST` | `/api/issues/:id/rate` | Citizen (owner) | Submit 1–5 star satisfaction rating for resolved issue |
| `GET` | `/api/issues/stats` | Admin | Get total, pending, in-progress, resolved, and escalated counts |
| `GET` | `/api/issues/analytics` | Admin | Aggregate category, sentiment, status, and timeline analytics |
| `PATCH` | `/api/issues/bulk` | Admin | Bulk status/priority update |
| `DELETE` | `/api/issues/bulk` | Admin | Bulk delete issues |
| `DELETE` | `/api/issues/:id` | Admin / Owner | Delete a single issue |

### Auth & User Management

| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/sync` | Signed in | Upsert user record and retrieve role + assigned department |
| `GET` | `/api/auth/users` | Admin | List all registered users |
| `PATCH` | `/api/auth/users/:id` | Admin | Assign or remove department admin role and department |

---

## 📄 License

MIT © [PRATYAKSH](https://github.com/PRATYAKSH15)
