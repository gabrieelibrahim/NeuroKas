AI Telegram Cash Management Bot — Project Planning
Project Name
NeuroCash AI
AI-powered Telegram bot for automatic cash bookkeeping, receipt scanning, and financial insights.

1. Project Overview
NeuroCash AI is a Telegram bot that helps users record income and expenses using:

text messages
receipt photos
screenshots of transfers
voice notes

The bot uses AI (GPT/Gemini) to automatically understand transactions and store them into a database.

2. Main Goals
Goals

Simplify bookkeeping
Automatic expense tracking
AI-powered transaction categorization
Receipt OCR scanning
Financial reports
Budget monitoring


3. Core Features (MVP)
3.1 Text Transaction Input
Example
makan siang 25rb

Bot response:
✅ Pengeluaran tercatat

Kategori: Makanan
Nominal: Rp25.000


3.2 Receipt Photo Scanner
User uploads:

receipt photo
transfer screenshot
QRIS payment screenshot

AI extracts:

merchant
amount
date
payment method
category


3.3 Auto Categorization
Categories:

Food
Transport
Subscription
Salary
Shopping
Bills
Investment
Business


3.4 Balance Checking
Commands
/saldo
/today
/week
/month


3.5 Reports
Generate:

PDF reports
Excel reports
Monthly summaries


3.6 AI Insights
Example:
Pengeluaran makanan naik 32% dibanding bulan lalu.


4. Advanced Features (Phase 2)
4.1 Voice Note Input
User sends:

voice note

AI converts:
Speech → Text → Transaction

4.2 Budget Management
Example:
budget makan 2 juta bulan ini


4.3 Smart Reminder
Examples:

internet payment reminder
monthly subscription reminder
budget limit warning


4.4 Duplicate Transaction Detection
Prevent duplicated receipts or duplicate inputs.

4.5 Multi-User Team Finance
For:

small businesses
startup teams
finance groups


5. System Architecture
Telegram User
      ↓
Telegram Bot API
      ↓
Node.js Backend
      ↓
AI Engine (GPT/Gemini)
      ↓
OCR & Receipt Scanner
      ↓
PostgreSQL Database
      ↓
Analytics & Reports


6. Recommended Technology Stack
Backend
Node.js + Telegraf.js
Why?

Fast development
Great Telegram ecosystem
Easy deployment

Libraries

Telegraf.js
Axios
Prisma ORM


Database
PostgreSQL
Recommended Provider

Supabase

Benefits

Free tier
Built-in PostgreSQL
Easy API
File storage support


AI Engine
Option A — Gemini
Use Cases

Receipt OCR
Vision AI
Cheap inference cost

Model

Gemini 2.5 Flash


Option B — OpenAI GPT
Use Cases

Smart reasoning
Better conversation
Financial analysis

Model

GPT-5 mini


Best Combination
Recommended Hybrid
Gemini → OCR & Vision
GPT → Financial reasoning


7. Folder Structure
project/
│
├── src/
│   ├── bot/
│   ├── services/
│   ├── ai/
│   ├── database/
│   ├── handlers/
│   ├── middleware/
│   ├── utils/
│   └── reports/
│
├── prisma/
├── uploads/
├── .env
├── package.json
└── README.md


8. Database Design
users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE,
    username TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);


transactions
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    type TEXT,
    amount BIGINT,
    category TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);


receipts
CREATE TABLE receipts (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER REFERENCES transactions(id),
    image_url TEXT,
    raw_ocr TEXT,
    merchant TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);


budgets
CREATE TABLE budgets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    category TEXT,
    limit_amount BIGINT,
    month TEXT
);


9. Telegram Bot Commands
/start
/help
/saldo
/today
/week
/month
/report
/export
/budget
/settings


10. AI Parsing Flow
User Input
bayar netflix 54 ribu


AI Prompt
Extract transaction data from Indonesian text.

Return JSON only.

Fields:
- type
- amount
- category
- description


AI Output
{
  "type": "expense",
  "amount": 54000,
  "category": "Subscription",
  "description": "Netflix"
}


11. Receipt OCR Flow
Flow
Photo Upload
     ↓
Telegram File Download
     ↓
Upload to Storage
     ↓
Gemini Vision OCR
     ↓
AI Parsing
     ↓
Save to Database
     ↓
Send Confirmation


12. Storage System
Recommended

Supabase Storage

Alternative

Cloudinary


13. Deployment
Recommended Hosting
Railway
Good for MVP.
VPS
Good for production scaling.
Recommended VPS:

Hetzner
Contabo


14. Security
Required Security

rate limiting
webhook validation
encrypted environment variables
Telegram user validation


15. Environment Variables
BOT_TOKEN=
OPENAI_API_KEY=
GEMINI_API_KEY=
DATABASE_URL=
SUPABASE_URL=
SUPABASE_KEY=


16. Monetization
Free Plan

100 transactions/month
basic reports


Premium Plan

unlimited transactions
receipt OCR
PDF export
AI insights
budgeting tools


17. Payment Gateway
Indonesia

Midtrans
Xendit


18. Future Roadmap
Phase 1
✅ Text transaction input
✅ Balance tracking
✅ Reports

Phase 2
✅ Receipt OCR
✅ Screenshot scanning
✅ AI categorization

Phase 3
✅ Dashboard website
✅ Budget analytics
✅ Charts & insights

Phase 4
✅ Voice note support
✅ AI financial coach
✅ Team finance mode

19. Estimated Development Timeline
MVP
3–7 days
Full Product
2–6 weeks

20. Estimated Initial Cost
MVP Scale
Hosting: $5–10/month
Database: Free
Gemini API: Cheap
Telegram Bot API: Free


21. Recommended Final Stack
Best MVP Stack
Frontend: Telegram
Backend: Node.js
Bot Library: Telegraf.js
Database: Supabase PostgreSQL
Storage: Supabase Storage
OCR: Gemini Flash Vision
AI Reasoning: GPT-5 mini
Hosting: Railway


22. Branding Ideas
Names

NeuroCash AI
KasMind
KasBot AI
DuitTrack
NeuroFinance
CashPilot
KasVision AI


23. Competitive Advantages
Why This Bot is Different
✅ AI-powered bookkeeping
✅ Natural language input
✅ Receipt scanner
✅ Financial insights
✅ Telegram-first simplicity
✅ Indonesian language optimized

24. Success Metrics
KPI

Daily active users
Monthly transactions processed
OCR accuracy
Retention rate
Premium conversion rate


25. Final Recommendation
Fastest Path to Launch
Use:
Telegram + Node.js + Gemini Flash + Supabase

This combination is:

cheap
scalable
easy to maintain
fast for MVP launch


User Isolation & Data Security
Overview
Each Telegram user has completely isolated financial data.
The system uses Telegram's unique telegram_id to identify users and securely separate all transactions, reports, receipts, and balances.

User Identification
Telegram automatically provides:
{
  "from": {
    "id": 712839123,
    "username": "gabriel"
  }
}

The from.id value becomes:
telegram_id

This ID is unique for every Telegram account.

Secure Transaction Flow
User sends message
        ↓
Bot reads telegram_id
        ↓
Bot finds user in database
        ↓
Transaction linked to user_id
        ↓
All queries filtered by user_id


Database Relationship
users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE,
    username TEXT
);


transactions
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    amount BIGINT,
    category TEXT,
    description TEXT
);


Example
User A
telegram_id = 111111

User B
telegram_id = 222222

Transactions are stored separately and cannot mix.

Secure Queries
❌ Unsafe query:
SELECT * FROM transactions;


✅ Secure query:
SELECT * FROM transactions
WHERE user_id = $1;


Row Level Security (RLS)
If using Supabase:

enable RLS
restrict access per authenticated user

This prevents accidental data leaks.

Security Best Practices
Required

Row Level Security
Environment variable protection
Telegram webhook verification
Rate limiting
User-based filtering


Team Workspace Support
Future architecture:
workspace_id

Allows:

company finance teams
shared bookkeeping
role permissions


Conclusion
The system architecture ensures:

User A cannot access User B data
receipts remain private
balances are isolated
reports are user-specific

This follows modern fintech security architecture standards.
