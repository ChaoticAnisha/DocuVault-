# DocuVault — Local Setup (Windows, No Docker)

## Prerequisites
- Node.js 20+
- PostgreSQL 17 (running, database: docuvault_db)

## Quick Start
1. Clone repo
2. cd docuvault
3. npm install (root)
4. cd backend && npm install && cd ../frontend && npm install && cd ..
5. Fill in backend/.env (copy from .env.example, generate secrets)
6. npx prisma migrate dev (from backend folder)
7. npm run seed (from backend folder)
8. npm run dev (from root — starts both)

## Test Accounts
- Admin: admin@docuvault.com / Admin@123456!
- Editor: editor@docuvault.com / Editor@123456!

## What works without Redis
- All auth, MFA, file upload/download, RBAC, logging ✅
- Rate limiting uses memory store (resets on restart) ⚠️

## What needs extra setup
- Google OAuth: add real GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env
- Stripe: add real STRIPE_SECRET_KEY to .env
- Email: replace Ethereal credentials with real SMTP for production
