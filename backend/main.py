import json
import os
import time
from contextlib import asynccontextmanager
from typing import List
from urllib.parse import urlparse

import psycopg2
import psycopg2.extras

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

START_TIME = time.time()

# ---------------------------------------------------------------------------
# Poll Configuration
# ---------------------------------------------------------------------------
POLL = {
    "id": "friday-poll",
    "question": "What should the team do this Friday?",
    "options": [
        {"id": "a", "label": "Team lunch at a restaurant"},
        {"id": "b", "label": "Work from home + virtual hangout"},
        {"id": "c", "label": "Outdoor team activity"},
        {"id": "d", "label": "Hackathon / build day"},
    ],
}

DATABASE_URL = os.getenv("DATABASE_URL")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_db():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is not set")
    return psycopg2.connect(DATABASE_URL)


def init_db():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS votes (
                    username TEXT PRIMARY KEY,
                    option_id TEXT NOT NULL
                )
                """
            )
        conn.commit()
    finally:
        conn.close()


def get_vote_counts() -> dict:
    counts = {opt["id"]: 0 for opt in POLL["options"]}
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT option_id, COUNT(*) AS cnt FROM votes GROUP BY option_id"
            )
            rows = cur.fetchall()
    finally:
        conn.close()
    for row in rows:
        if row["option_id"] in counts:
            counts[row["option_id"]] = int(row["cnt"])
    return counts


def get_user_vote(username: str):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT option_id FROM votes WHERE username = %s", (username,)
            )
            row = cur.fetchone()
    finally:
        conn.close()
    return row["option_id"] if row else None


def record_vote(username: str, option_id: str):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO votes (username, option_id) VALUES (%s, %s)",
                (username, option_id),
            )
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# WebSocket connection manager
# ---------------------------------------------------------------------------

MAX_CONNECTIONS = 100


class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        if len(self.active) >= MAX_CONNECTIONS:
            await ws.close(code=1008, reason="Server at capacity")
            return False
        await ws.accept()
        self.active.append(ws)
        return True

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, data: dict):
        message = json.dumps(data)
        for ws in list(self.active):
            try:
                await ws.send_text(message)
            except Exception:
                self.disconnect(ws)


manager = ConnectionManager()

# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="Voting Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# ---------------------------------------------------------------------------
# REST Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health_check():
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        conn.close()
        db_status = "ok"
    except Exception as e:
        db_status = f"error: {e}"

    db_host = urlparse(DATABASE_URL).hostname if DATABASE_URL else "not configured"
    uptime_seconds = round(time.time() - START_TIME, 1)

    try:
        total_votes = sum(get_vote_counts().values())
    except Exception:
        total_votes = None

    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "service": "vote-service",
        "uptime_seconds": uptime_seconds,
        "database": db_status,
        "db_host": db_host,
        "total_votes": total_votes,
        "active_connections": len(manager.active),
    }


@app.get("/poll")
def get_poll(username: str = ""):
    counts = get_vote_counts()
    user_vote = get_user_vote(username) if username else None
    total = sum(counts.values())
    return {
        "poll": POLL,
        "counts": counts,
        "total": total,
        "user_vote": user_vote,
    }


class VoteRequest(BaseModel):
    username: str
    option_id: str


@app.post("/vote")
async def submit_vote(body: VoteRequest):
    username = body.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")

    valid_ids = {opt["id"] for opt in POLL["options"]}
    if body.option_id not in valid_ids:
        raise HTTPException(status_code=400, detail="Invalid option")

    existing = get_user_vote(username)
    if existing:
        raise HTTPException(
            status_code=409,
            detail={"message": "User has already voted", "option_id": existing},
        )

    record_vote(username, body.option_id)
    counts = get_vote_counts()
    total = sum(counts.values())

    payload = {"type": "vote_update", "counts": counts, "total": total}
    await manager.broadcast(payload)

    return {"success": True, "counts": counts, "total": total}


# ---------------------------------------------------------------------------
# WebSocket Endpoint
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    accepted = await manager.connect(ws)
    if not accepted:
        return
    counts = get_vote_counts()
    total = sum(counts.values())
    await ws.send_text(json.dumps({"type": "vote_update", "counts": counts, "total": total}))
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)
