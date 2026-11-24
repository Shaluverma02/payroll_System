# REST API overview

All endpoints are prefixed by `/api`. Except `/auth/register`, `/auth/login`, and `/health`, routes require `Authorization: Bearer <JWT>`.

| Area | Routes | Purpose |
|---|---|---|
| Auth | POST `/auth/register`, POST `/auth/login`, GET `/auth/me` | Admin registration, login, current profile |
| Security | GET `/auth/2fa/status`, POST `/auth/2fa/setup`, POST `/auth/2fa/confirm`, POST `/auth/2fa/disable` | Enroll and verify authenticator-app TOTP codes; login accepts optional `otp` |
| Workspace accounts | GET/POST `/users`, PUT/DELETE `/users/:id` | Admin-managed roles: `admin`, `hr`, `payroll_manager`, `department_manager`, `employee` |
| Employee self-service | GET `/me/profile`, `/me/payslips`, `/me/attendance` | Employee-linked accounts can view only their own records |
| Employees | GET/POST `/employees`, GET/PUT/DELETE `/employees/:id` | Search (`q`), status/department filter and pagination; employee CRUD |
| Bulk import | POST `/employees/import` as multipart form field `file` | CSV upload, up to 1,000 rows, row-level errors |
| Departments | GET/POST `/departments`, PUT/DELETE `/departments/:id` | Department CRUD |
| Attendance | GET/POST `/attendance`, PUT/DELETE `/attendance/:id` | Daily records and month/employee filters; department managers can record only for employees in their own department |
| Salary | GET/POST `/salary`, PUT/DELETE `/salary/:id` | Salary structures and gross/net preview |
| Payroll | GET/POST `/payroll`, GET/PUT/DELETE `/payroll/:id`, PUT `/payroll/:id/approval` | Generate by employee/month/year; distinct approval and payment states |
| Payslips | GET `/payslips/:payrollId`, GET `/payslips/:payrollId/pdf` | Payslip data / PDF download |
| Leave | GET/POST `/leave`, PUT `/leave/:id/review` | Employee leave requests; HR/department manager review; approved unpaid weekdays affect payroll |
| Salary history | GET `/salary-revisions/:employeeId` | Effective-dated compensation snapshots and reasons |
| Notifications | GET `/notifications`, PUT `/notifications/:id/read`, PUT `/notifications/read-all` | In-app messages; SMTP email delivery is optional |
| Company settings | GET/PUT `/settings/company` | Currency, locale, tax jurisdiction/year, and company payslip details |
| Audit | GET `/audit` | Recent actor, action, entity, and detail records |
| Backups | GET `/backups/download`, POST `/backups/restore` | JSON MongoDB backup download; restore requires `.json` upload and confirmation text `RESTORE` |
| Reports | GET `/reports/summary`, GET `/reports/employees/:employeeId/salary-history`, GET `/reports/payroll.csv`, GET `/reports/payroll.pdf`, GET `/reports/department.csv` | Dashboard metrics, salary history, payroll CSV/PDF and department CSV exports |

Errors are JSON `{ "error": "..." }`. Payroll creation body: `{ "employeeId": 1, "month": 10, "year": 2026 }`. Duplicate employee/month/year payrolls return HTTP 409. Dates use ISO format; monetary amounts use decimal values in the configured currency. Currency and locale changes apply to all UI amounts immediately without converting stored numeric amounts; report CSV headers and generated PDFs identify the configured currency.

Registration is only open for initial workspace setup. Once the first administrator exists, an admin creates role accounts from Workspace Tools. Set SMTP environment variables to enable optional email. Backups are JSON exports of MongoDB collections. Tax jurisdiction is configuration metadata; salary tax/deduction amounts remain explicitly entered and are not calculated from statutory tax rules.
