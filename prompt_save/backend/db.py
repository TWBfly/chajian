import sqlite3
import json
from datetime import datetime

DB_NAME = 'prompts.db'

def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    
    # Create prompts table
    c.execute('''
        CREATE TABLE IF NOT EXISTS prompts (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            tags TEXT,  -- JSON string of tags list
            created_at INTEGER,
            updated_at INTEGER,
            order_index INTEGER DEFAULT 0
        )
    ''')
    
    # Create tags table for managing global tags list
    c.execute('''
        CREATE TABLE IF NOT EXISTS tags (
            name TEXT PRIMARY KEY,
            order_index INTEGER DEFAULT 0
        )
    ''')
    
    conn.commit()
    conn.close()

def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn
