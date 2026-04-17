"""
main.py
-------
SecureVault – FastAPI backend entry point.

Run:
  uvicorn main:app --reload --port 8000
"""

import logging
import os
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s: %(message)s",
    handlers=[
        logging.FileHandler("secure_vault.log"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)

# ── DB init ───────────────────────────────────────────────────────────────────
import database as db
db.initialize_db()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title       = "SecureVault API",
    description = "Multi-factor authentication + encrypted file vault",
    version     = "2.0.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
FRONTEND_ORIGINS = os.getenv("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins     = [FRONTEND_ORIGINS, "http://localhost:3000"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
from routes.auth_routes import router as auth_router
from routes.vault_routes import router as vault_router
from routes.user_routes import router as user_router
from routes.system_routes import router as system_router

app.include_router(auth_router)
app.include_router(vault_router)
app.include_router(user_router)
app.include_router(system_router)

# ── Intruder images (optional static serve, auth-gated in prod) ───────────────
intruder_dir = Path(__file__).parent / "intruder_images"
intruder_dir.mkdir(parents=True, exist_ok=True)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "service": "SecureVault API v2.0"}


@app.get("/", tags=["system"])
async def root():
    return {
        "message": "SecureVault API is running.",
        "docs":    "/docs",
        "health":  "/health",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
