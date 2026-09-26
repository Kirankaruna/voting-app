import sqlite3
import json
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Hardcoded Poll Configuration
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

DB_PATH = "/data/votes.db"

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS votes (
                username TEXT PRIMARY KEY,
                option_id TEXT NOT NULL
            )
            """
        )
        conn.commit()


def get_vote_counts() -> dict:
    counts = {opt["id"]: 0 for opt in POLL["options"]}
    with get_db() as conn:
        rows = conn.execute("SELECT option_id, COUNT(*) as cnt FROM votes GROUP BY option_id").fetchall()
    for row in rows:
        if row["option_id"] in counts:
            counts[row["option_id"]] = row["cnt"]
    return counts


def get_user_vote(username: str):
    with get_db() as conn:
        row = conn.execute("SELECT option_id FROM votes WHERE username = ?", (username,)).fetchone()
    return row["option_id"] if row else None


def record_vote(username: str, option_id: str):
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO votes (username, option_id) VALUES (?, ?)",
            (username, option_id),
        )
        conn.commit()

# ---------------------------------------------------------------------------
# WebSocket connection manager
# ---------------------------------------------------------------------------

class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# REST Endpoints
# ---------------------------------------------------------------------------

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
        raise HTTPException(status_code=409, detail="User has already voted")

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
    await manager.connect(ws)
    # Send current state immediately on connect
    counts = get_vote_counts()
    total = sum(counts.values())
    await ws.send_text(json.dumps({"type": "vote_update", "counts": counts, "total": total}))
    try:
        while True:
            await ws.receive_text()  # keep connection alive
    except WebSocketDisconnect:
        manager.disconnect(ws)
