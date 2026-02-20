# Student Voice - Feedback System

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Environment variables
The `.env.local` file is already configured with your Firebase project.
No changes needed for development.

### 3. Seed the database
This creates a sample survey with 25 questions and a test deployment:
```bash
npm run seed
```
The script will print a student URL token — save it.

### 4. Run the dev server
```bash
npm run dev
```

### 5. Test it
- **Student survey**: `http://localhost:3000/s/YOUR_TOKEN_HERE`
- **Admin dashboard**: `http://localhost:3000/admin`
- **Home**: `http://localhost:3000`

## Project Structure
```
src/
├── app/
│   ├── page.tsx              # Home page
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Tailwind styles
│   ├── s/[token]/            # Student survey (public)
│   │   ├── page.tsx
│   │   └── survey-runner.tsx # Main survey component
│   └── admin/
│       └── page.tsx          # Admin dashboard (placeholder)
├── lib/
│   ├── firebase.ts           # Client SDK (browser)
│   └── firebase-admin.ts     # Admin SDK (server only)
├── types/
│   └── index.ts              # TypeScript types (matches Firestore model)
└── components/
    └── ui/                   # Reusable UI components (coming)

scripts/
└── seed.ts                   # Seeds Firestore with sample data
```

## Build Order
1. ✅ Firebase setup + Firestore connection
2. ✅ Student survey runner
3. 🔲 Admin dashboard (view responses, filter)
4. 🔲 Survey builder UI
5. 🔲 Deployment generator (QR codes)
6. 🔲 AI summaries + shareable reports
