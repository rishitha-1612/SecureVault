"""
Protected system status endpoint for the dashboard health indicator.
"""

import logging
from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import auth
import database as db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/system", tags=["system"])
bearer = HTTPBearer(auto_error=False)

VAULT_DIR = Path(__file__).parent.parent / "vault_storage"
INTRUDER_DIR = Path(__file__).parent.parent / "intruder_images"


def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
) -> str:
    if not creds:
        raise HTTPException(401, "Not authenticated")
    username = auth.decode_access_token(creds.credentials)
    if not username:
        raise HTTPException(401, "Invalid or expired token")
    if not db.get_user(username):
        raise HTTPException(401, "User not found")
    return username


def _component(status: str, message: str) -> dict:
    return {"status": status, "message": message}


@router.get("/status")
async def system_status(username: Annotated[str, Depends(get_current_user)]):
    components = {
        "api": _component("online", "API reachable"),
        "database": _component("online", "Database reachable"),
        "vault_storage": _component("online", "Vault storage ready"),
        "alerts": _component("online", "No recent alert spikes"),
    }

    try:
        db.get_user(username)
    except Exception as exc:
        logger.exception("System status database check failed")
        components["database"] = _component("offline", f"Database check failed: {exc}")

    try:
        VAULT_DIR.mkdir(parents=True, exist_ok=True)
        INTRUDER_DIR.mkdir(parents=True, exist_ok=True)
        if not VAULT_DIR.exists() or not VAULT_DIR.is_dir():
            components["vault_storage"] = _component("offline", "Vault storage unavailable")
    except Exception as exc:
        logger.exception("System status storage check failed")
        components["vault_storage"] = _component("offline", f"Storage check failed: {exc}")

    try:
        recent_alerts = db.count_recent_failures(username, minutes=30)
    except Exception as exc:
        logger.exception("System status alert check failed")
        recent_alerts = 0
        components["database"] = _component("offline", f"Alert check failed: {exc}")
    if recent_alerts >= auth.MAX_ATTEMPTS:
        components["alerts"] = _component("degraded", f"{recent_alerts} failed or intruder events in 30 minutes")
    elif recent_alerts:
        components["alerts"] = _component("online", f"{recent_alerts} recent failed event(s) monitored")

    offline_count = sum(1 for item in components.values() if item["status"] == "offline")
    degraded_count = sum(1 for item in components.values() if item["status"] == "degraded")
    if offline_count:
        status = "offline"
    elif degraded_count:
        status = "degraded"
    else:
        status = "online"

    score = max(0, 100 - (offline_count * 35) - (degraded_count * 15))

    return {
        "status": status,
        "score": score,
        "checked_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        "service": "SecureVault API v2.0",
        "components": components,
        "recent_alerts": recent_alerts,
    }
