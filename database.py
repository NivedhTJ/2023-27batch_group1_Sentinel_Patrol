import os
import pymysql
from dotenv import load_dotenv
from sqlmodel import create_engine, Session, SQLModel

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "sentinel_patrol")

import urllib.parse

# Connection URL for SQLModel (URL encode password to handle special characters like '@')
encoded_password = urllib.parse.quote_plus(DB_PASSWORD)
DATABASE_URL = f"mysql+pymysql://{DB_USER}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(DATABASE_URL, echo=True)

def create_db_and_tables():
    """
    Ensure the MySQL database exists, then create all registered tables.
    """
    # Establish connection to MySQL server without specifying database name first
    connection = pymysql.connect(
        host=DB_HOST,
        port=int(DB_PORT),
        user=DB_USER,
        password=DB_PASSWORD
    )
    try:
        with connection.cursor() as cursor:
            # Create database if it does not exist
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}`")
        connection.commit()
    finally:
        connection.close()

    # Import models here to ensure they are registered on SQLModel.metadata
    import models
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
