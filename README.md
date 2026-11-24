# Northstar Payroll

A full-stack employee payroll management demo using React/Vite, Express, Mongoose/MongoDB, and native JavaScript payroll calculations. It includes role-managed accounts (admin, HR, payroll manager, department manager, employee), scoped employee self-service, payroll approvals, SMTP/in-app notifications, leave requests, CSV employee import, effective-dated salary revisions, audit history, TOTP two-factor authentication, configurable currency/locale, and admin database backup/restore.

## Prerequisites
- Node.js 20+ and npm
- MongoDB running locally on `mongodb://localhost:27017`

## Setup
1. Ensure MongoDB is running on `localhost:27017`.
2. Copy `backend/.env.example` to `backend/.env`, set `MONGODB_URI=mongodb://localhost:27017/payroll_db`, and set a strong `JWT_SECRET`. Do not copy real passwords into any `.env.example` file or commit `backend/.env`.
3. Install dependencies: `npm install`, `npm --prefix backend install`, and `npm --prefix frontend install`. In Windows PowerShell, if the `npm` command is blocked by script execution policy, use `npm.cmd`.
4. Start both web and API processes with `npm run dev` from the project root. In Windows PowerShell, use `npm.cmd run dev` if the `npm` PowerShell shim is blocked. Frontend: `http://localhost:5173`; API: `http://localhost:4000/api`.
5. Register the first admin from the Register screen. After the first admin is created, public registration closes; create other staff roles from Workspace Tools. The API can optionally seed demo departments/employees/salary structures: run `npm --prefix backend run seed`.

The backend connects directly to MongoDB through Mongoose. PDF and CSV exports are generated natively by Express. SMTP notifications require `SMTP_HOST`, `SMTP_FROM`, and (where required) SMTP credentials. Admin backup/restore uses JSON collections and replaces database contents only after RESTORE confirmation. Do not use demo credentials or the default secret in production.

## Production deployment

The repository includes a Render Blueprint (`render.yaml`) for the Express API and a Netlify build configuration (`netlify.toml`) for the Vite frontend.

1. Push this project to a Git provider and create a MongoDB Atlas database. A local `mongodb://localhost:27017/...` database is not reachable by Render. Create a restricted Atlas database user and allow the Render service to connect in Atlas Network Access.
2. Import the repository into Netlify from its root. `netlify.toml` sets the frontend base directory, build command, publish directory, and SPA route fallback. Note the assigned Netlify site origin.
3. Deploy the repository to Render using the Blueprint. Set `MONGODB_URI` to the Atlas connection string for `payroll_db`, and set `CLIENT_ORIGIN` to the Netlify site origin (for example `https://your-site.netlify.app`, without a trailing slash). Render generates `JWT_SECRET`.
4. In Netlify site environment variables, set `VITE_API_URL` to `https://<your-render-service>.onrender.com/api`, then trigger a new deploy. The frontend setting must include `/api`.
5. Verify the Render health check at `https://<your-render-service>.onrender.com/api/health`, then test sign-in and API-backed pages on the Netlify URL.

Never put Atlas credentials, JWT secrets, or production environment values in committed files. Keep `CLIENT_ORIGIN` limited to the deployed Netlify origin(s).


## Project structure
- `frontend/` React single-page application
- `backend/` Express REST API, Mongoose models, JWT middleware, native payroll/PDF services, seed script
- `API.md` endpoint overview

## Main workflows
Register/login as administrator, create employees and departments, define each employee's salary, record attendance, then generate payroll for a month. Payroll generation prevents duplicate employee/month/year records, factors unpaid leave and overtime, and delegates calculations to Python. Mark payroll paid from Payroll History; open a payslip to print or download its PDF. Reports can be filtered and exported as CSV.
Payroll begins in a separate approval state; use the Payroll approvals screen before marking a record paid. Approved unpaid leave weekdays are considered by payroll. Locale settings control monetary display and PDF currency; tax jurisdiction is metadata only, and statutory tax calculations must be configured/reviewed for the applicable country before real payroll use. Enable authenticator-based 2FA from Workspace Tools → Two-factor security.
