import json
import os
import sqlite3
import time
from contextlib import contextmanager

DB_PATH = os.environ.get("DB_PATH", "/data/app.db")
SID = "default"  # задел под student_id


def init() -> None:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS code(student_id TEXT DEFAULT 'default', key TEXT, code TEXT, updated REAL, PRIMARY KEY(student_id,key));
        CREATE TABLE IF NOT EXISTS task_progress(student_id TEXT DEFAULT 'default', task_id TEXT, status TEXT, attempts INTEGER DEFAULT 0, solved_at REAL, last_result TEXT, PRIMARY KEY(student_id,task_id));
        CREATE TABLE IF NOT EXISTS lesson_progress(student_id TEXT DEFAULT 'default', lesson_id TEXT, manual_done INTEGER DEFAULT 0, PRIMARY KEY(student_id,lesson_id));
        CREATE TABLE IF NOT EXISTS settings(student_id TEXT DEFAULT 'default', key TEXT, value TEXT, PRIMARY KEY(student_id,key));
        """)


@contextmanager
def conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def get_code(key):
    with conn() as c:
        r = c.execute("SELECT code FROM code WHERE student_id=? AND key=?", (SID, key)).fetchone()
    return r["code"] if r else None


def put_code(key, code):
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO code VALUES(?,?,?,?)", (SID, key, code, time.time()))
    # статус «в процессе»
    if key.startswith("task:"):
        tid = key[5:]
        with conn() as c:
            c.execute("INSERT OR IGNORE INTO task_progress(student_id,task_id,status) VALUES(?,?, 'started')", (SID, tid))


def all_settings():
    with conn() as c:
        return {r["key"]: json.loads(r["value"]) for r in c.execute("SELECT key,value FROM settings WHERE student_id=?", (SID,))}


def put_settings(d):
    with conn() as c:
        for k, v in d.items():
            c.execute("INSERT OR REPLACE INTO settings VALUES(?,?,?)", (SID, k, json.dumps(v)))


def task_statuses():
    with conn() as c:
        return {r["task_id"]: {"status": r["status"], "attempts": r["attempts"], "last_result": json.loads(r["last_result"] or "null")}
                for r in c.execute("SELECT * FROM task_progress WHERE student_id=?", (SID,))}


def record_check(task_id, solved, results):
    with conn() as c:
        row = c.execute("SELECT status,attempts FROM task_progress WHERE student_id=? AND task_id=?", (SID, task_id)).fetchone()
        attempts = (row["attempts"] if row else 0) + 1
        was_solved = row and row["status"] == "solved"
        status = "solved" if (solved or was_solved) else "started"
        c.execute("INSERT OR REPLACE INTO task_progress VALUES(?,?,?,?,?,?)",
                  (SID, task_id, status, attempts, time.time() if solved else None, json.dumps(results)))


def lesson_manual():
    with conn() as c:
        return {r["lesson_id"]: bool(r["manual_done"]) for r in c.execute("SELECT * FROM lesson_progress WHERE student_id=?", (SID,))}


def set_manual(lesson_id, done):
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO lesson_progress VALUES(?,?,?)", (SID, lesson_id, int(done)))
