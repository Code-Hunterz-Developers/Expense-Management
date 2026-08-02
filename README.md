# Expense-Management

Upwork expense & profit management dashboard for Code Hunterz — track investment, revenue, salary, and expenses per Upwork ID.

## Stack

- Next.js 15 (App Router)
- Firebase Auth + Firestore
- Client-side caching (localStorage)

## Setup

```bash
npm install
npm run dev
```

Open: **http://localhost:3000**

## Environment (optional)

Copy `.env.local.example` to `.env.local` if you want to override Firebase config.

## Deploy

Works on Vercel — set Firebase env vars if needed and publish Firestore rules from `firestore.rules`.
