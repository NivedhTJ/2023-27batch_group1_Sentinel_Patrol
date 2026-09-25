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

def sync_missing_columns():
    """
    Ensure existing MySQL tables have all columns defined in SQLModel.
    SQLModel.metadata.create_all() does not alter pre-existing tables to add new columns.
    """
    try:
        conn = pymysql.connect(
            host=DB_HOST,
            port=int(DB_PORT),
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
        with conn.cursor() as cursor:
            # Check user table columns
            cursor.execute("SHOW TABLES LIKE 'user'")
            if cursor.fetchone():
                cursor.execute("SHOW COLUMNS FROM `user`")
                existing_cols = {row[0] for row in cursor.fetchall()}
                user_cols = [
                    ("station_id", "INT NULL"),
                    ("department", "VARCHAR(255) NULL"),
                    ("phone", "VARCHAR(255) NULL"),
                    ("email", "VARCHAR(255) NULL"),
                    ("is_admin", "BOOL NOT NULL DEFAULT FALSE"),
                    ("is_active", "BOOL NOT NULL DEFAULT TRUE"),
                    ("joined_date", "DATETIME NULL"),
                    ("created_at", "DATETIME NULL"),
                    ("updated_at", "DATETIME NULL"),
                ]
                for col, col_def in user_cols:
                    if col not in existing_cols:
                        cursor.execute(f"ALTER TABLE `user` ADD COLUMN `{col}` {col_def}")
                        print(f"Added column '{col}' to table 'user'")

            # Check station table columns
            cursor.execute("SHOW TABLES LIKE 'station'")
            if cursor.fetchone():
                cursor.execute("SHOW COLUMNS FROM `station`")
                existing_st_cols = {row[0] for row in cursor.fetchall()}
                st_cols = [
                    ("phone", "VARCHAR(255) NULL"),
                    ("officer_in_charge", "VARCHAR(255) NULL"),
                    ("is_active", "BOOL NOT NULL DEFAULT TRUE"),
                    ("created_at", "DATETIME NULL"),
                ]
                for col, col_def in st_cols:
                    if col not in existing_st_cols:
                        cursor.execute(f"ALTER TABLE `station` ADD COLUMN `{col}` {col_def}")
                        print(f"Added column '{col}' to table 'station'")

        conn.commit()
        conn.close()
    except Exception as err:
        print(f"Schema sync note: {err}")

def create_db_and_tables():
    """
    Ensure the MySQL database exists, sync missing columns, then create all registered tables.
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
    sync_missing_columns()

def get_session():
    with Session(engine) as session:
        yield session

