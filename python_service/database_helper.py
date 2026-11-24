"""Optional SQLAlchemy helper for standalone Python data access."""
import os
from sqlalchemy import URL, create_engine

def get_engine():
    """Return a SQLAlchemy engine configured from DB_* environment variables."""
    user = os.getenv("DB_USER", "root")
    password = os.getenv("DB_PASSWORD", "")
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "3306")
    database = os.getenv("DB_NAME", "payroll_db")
    url = URL.create("mysql+mysqlconnector", username=user, password=password, host=host, port=int(port), database=database)
    return create_engine(url, pool_pre_ping=True)
