# Employee Payroll Management

- Workspace contains a Vite/React client in `frontend/`, an Express/Sequelize REST API in `backend/`, and the JSON-stdio Python payroll service in `python_service/`.
- Use JavaScript ES modules in the frontend and CommonJS in the backend.
- Payroll formulas belong in `python_service/payroll_calculator.py`; keep Node payroll generation delegated to the Python service.
- API models use camelCase JavaScript properties and Sequelize maps them to snake_case MySQL columns.
- Never commit `.env`, credentials, or production secrets. Keep setup instructions synchronized with `README.md` and endpoint behavior with `API.md`.
