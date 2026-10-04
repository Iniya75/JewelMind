from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os
from pathlib import Path

import urllib.parse

backend_env = Path(__file__).resolve().parent / ".env"
project_env = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(backend_env if backend_env.exists() else project_env)

db_url = os.getenv('DATABASE_URL')
if db_url:
    if db_url.startswith("mysql://"):
        SQLALCHEMY_DATABASE_URL = db_url.replace("mysql://", "mysql+pymysql://", 1)
    else:
        SQLALCHEMY_DATABASE_URL = db_url
else:
    user = urllib.parse.quote_plus(os.getenv('MYSQL_USER') or '')
    password = urllib.parse.quote_plus(os.getenv('MYSQL_PASSWORD') or '')
    host = os.getenv('MYSQL_HOST') or '127.0.0.1'
    port = os.getenv('MYSQL_PORT') or '3307'
    database = os.getenv('MYSQL_DATABASE') or 'jewelmind'
    SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()