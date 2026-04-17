"""
routes/auth_routes.py
----------------------
FastAPI router for all authentication endpoints:
  POST /api/auth/register
  POST /api/auth/login
  POST /api/auth/face-verify
  POST /api/auth/verify-otp
  POST /api/auth/resend-otp
  POST /api/auth/forgot-password
  GET  /api/auth/validate-reset-token/{token}
  POST /api/auth/reset-password
  GET  /api/auth/me

Key upgrades in this version:
  - DB-backed per-user attempt counter (max 3, resets after trigger)
  - 30-second account lockout after 3 failed password attempts
  - Intruder detection: optional webcam snapshot included in login request
    OR face-mismatch image from face-verify stage → saves image + emails alert
  - Rich location (city/region/country/lat/lon/maps_url) stored per attempt
  - Password reset tokens expire in 10 minutes (spec requirement)
"""

import base64
import logging
import secrets as _sec
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr

import auth
import database as db
import email_service as es
import face_recognition_module as frm

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)

# In-memory session store:
# key  = session_id (returned after password success)
# val  = {username, stage: "password"|"face"|"otp", location, ua}
_sessions: dict[str, dict] = {}


# ── Dependency: get current user from JWT ─────────────────────────────────────

def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
) -> str:
    if not creds:
        raise HTTPException(401, "Not authenticated")
    username = auth.decode_access_token(creds.credentials)
    if not username:
        raise HTTPException(401, "Invalid or expired token")
    user = db.get_user(username)
    if not user:
        raise HTTPException(401, "User not found")
    return username


# ── Models ────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username:   str
    email:      EmailStr
    password:   str
    face_image: str | None = None   # base64-encoded JPEG


class LoginRequest(BaseModel):
    username:        str
    password:        str
    latitude:        float | None = None
    longitude:       float | None = None
    location_accuracy: float | None = None
    location_permission: str | None = None
    intruder_image:  str | None = None   # base64 JPEG – captured silently on 3rd attempt


class FaceVerifyRequest(BaseModel):
    session_id: str
    face_image: str   # base64-encoded JPEG
    latitude: float | None = None
    longitude: float | None = None
    location_accuracy: float | None = None
    location_permission: str | None = None


class OTPVerifyRequest(BaseModel):
    session_id: str
    otp:        str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token:        str
    new_password: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _client_ip(request: Request) -> str:
    xff = request.headers.get("X-Forwarded-For")
    return xff.split(",")[0].strip() if xff else (request.client.host if request.client else "")


def _user_agent(request: Request) -> str:
    return request.headers.get("User-Agent", "Unknown")[:200]


def _b64_to_bytes(b64: str) -> bytes:
    """Decode a base64 or data-URI image string to raw bytes."""
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    return base64.b64decode(b64)


def _location_from_request(request: Request, body=None) -> dict:
    return auth.get_location(
        _client_ip(request),
        latitude=getattr(body, "latitude", None),
        longitude=getattr(body, "longitude", None),
        accuracy=getattr(body, "location_accuracy", None),
        permission=getattr(body, "location_permission", None),
    )


def _remove_temp_intruder_image(image_path: str | None) -> None:
    if not image_path:
        return
    try:
        path = Path(image_path)
        intruder_dir = Path(frm.INTRUDER_DIR).resolve()
        if path.exists() and intruder_dir in path.resolve().parents:
            path.unlink()
            logger.info("Temporary intruder image removed: %s", image_path)
    except Exception as exc:
        logger.warning("Could not remove temporary intruder image %s: %s", image_path, exc)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register")
async def register(body: RegisterRequest, request: Request):
    face_bytes = _b64_to_bytes(body.face_image) if body.face_image else None
    try:
        auth.register_user(body.username, body.email, body.password, face_bytes)
    except auth.RegistrationError as exc:
        raise HTTPException(400, str(exc))
    return {"message": f"Account '{body.username}' created successfully."}


@router.post("/login")
async def login(body: LoginRequest, request: Request):
    """
    Stage 1 – password check.

    Attempt tracking (DB-backed):
      - Fetch current count for this username.
      - If count >= MAX_ATTEMPTS AND account is locked → 429 with remaining seconds.
      - On wrong password → increment count.
      - If new count == MAX_ATTEMPTS:
          * Save intruder image (if sent by frontend webcam capture).
          * Send intruder-alert email.
          * Lock account for 30 seconds.
          * Reset count to 0.
      - On correct password → reset count → issue session.
    """
    ip       = _client_ip(request)
    ua       = _user_agent(request)
    location = _location_from_request(request, body)
    username = body.username.strip().lower()

    if not db.get_user(username):
        raise HTTPException(401, "Invalid username.")

    # ── 1. Hard lockout check ─────────────────────────────────────────────────
    lockout = auth.check_lockout(username)
    if lockout:
        remaining = lockout.data.get("lockout_remaining", 30)
        raise HTTPException(429,
            f"Account locked due to too many failed attempts. "
            f"Try again in {remaining} second(s).")

    # ── 2. Fetch current attempt count ───────────────────────────────────────
    current_count = db.get_failed_attempts(username)

    # ── 3. Authenticate ───────────────────────────────────────────────────────
    result = auth.authenticate_password(
        username, body.password,
        current_count + 1, location, ip, ua
    )

    if not result:
        # ── Wrong password ────────────────────────────────────────────────────
        new_count  = db.increment_failed_attempts(username)
        remaining  = max(0, auth.MAX_ATTEMPTS - new_count)

        if new_count >= auth.MAX_ATTEMPTS:
            # ── INTRUDER TRIGGER ──────────────────────────────────────────────
            user = db.get_user(username)
            intruder_img_path: str | None = None

            # Save webcam snapshot if the frontend sent one
            if body.intruder_image:
                try:
                    img_bytes         = _b64_to_bytes(body.intruder_image)
                    intruder_img_path = frm.save_intruder_image_from_bytes(img_bytes, username)
                    if intruder_img_path:
                        db.update_attempt_image(username, "password", new_count, intruder_img_path)
                        logger.info("Intruder webcam snapshot saved: %s", intruder_img_path)
                except Exception as exc:
                    logger.error("Failed to save intruder webcam image: %s", exc)

            if user:
                event_time = datetime.now(timezone.utc).strftime("%d %B %Y at %H:%M:%S UTC")
                es.send_intruder_alert(
                    user["email"], username, new_count,
                    location, intruder_img_path, ua,
                    event_time=event_time,
                )
                logger.warning(
                    "INTRUDER ALERT sent for user=%s after %d failed attempts. "
                    "Location=%s", username, new_count, location.get("display")
                )

            # Lock for 30 seconds, then reset counter
            db.set_lockout(username, seconds=auth.LOCKOUT_SECONDS)
            db.reset_failed_attempts(username)

            raise HTTPException(
                429,
                f"Maximum login attempts reached ({auth.MAX_ATTEMPTS}). "
                f"Account locked for {auth.LOCKOUT_SECONDS} seconds. "
                f"A security alert has been sent to the registered email."
            )

        # Fewer than MAX failures – tell the user how many attempts remain
        raise HTTPException(
            401,
            f"Incorrect password. {remaining} attempt{'s' if remaining != 1 else ''} remaining."
        )

    # ── 4. Password correct → reset counter and issue session ────────────────
    db.reset_failed_attempts(username)

    session_id = _sec.token_urlsafe(32)
    _sessions[session_id] = {
        "username": username,
        "stage":    "password",
        "location": location,
        "ua":       ua,
    }
    return {
        "message":    "Password verified.",
        "session_id": session_id,
        "next_step":  "face_verify",
        "location":   location,
    }


@router.post("/face-verify")
async def face_verify(body: FaceVerifyRequest, request: Request):
    """Stage 2 – face recognition."""
    session = _sessions.get(body.session_id)
    if not session or session.get("stage") != "password":
        raise HTTPException(400, "Invalid or expired session.")

    username    = session["username"]
    gps_location = _location_from_request(request, body)
    location = (
        gps_location
        if gps_location.get("source", "").startswith("gps") or not session.get("location")
        else session["location"]
    )
    session["location"] = location
    image_bytes = _b64_to_bytes(body.face_image)

    result = auth.authenticate_face(username, image_bytes, location)

    if not result:
        # ── FACE INTRUDER: image was already saved inside authenticate_face ──
        should_alert = bool(result.data.get("trigger_intruder_alert"))
        user = db.get_user(username)
        if should_alert and user:
            img_path = result.data.get("image_path")
            event_time = datetime.now(timezone.utc).strftime("%d %B %Y at %H:%M:%S UTC")
            es.send_intruder_alert(
                user["email"], username, max(1, int(result.data.get("attempt_count") or 1)),
                location, img_path, session.get("ua", "Unknown"),
                event_time=event_time,
            )
            logger.warning(
                "FACE INTRUDER ALERT sent for user=%s. Location=%s image=%s",
                username, location.get("display"), img_path
            )
        raise HTTPException(403 if should_alert else 400, result.message)

    # Advance stage and send OTP
    session["stage"] = "face"
    user = db.get_user(username)
    ok   = auth.send_otp(username, user["email"])
    if not ok:
        raise HTTPException(500, "Could not send OTP email. Check SMTP settings.")

    return {
        "message":   "Face verified. OTP sent to your email.",
        "next_step": "verify_otp",
        "location":  location,
    }


@router.post("/verify-otp")
async def verify_otp(body: OTPVerifyRequest):
    """Stage 3 – OTP verification. Returns JWT on success."""
    session = _sessions.get(body.session_id)
    if not session or session.get("stage") != "face":
        raise HTTPException(400, "Invalid or expired session.")

    username = session["username"]
    result   = auth.authenticate_otp(username, body.otp)
    if not result:
        raise HTTPException(401, result.message)

    # All stages passed → issue JWT
    token = auth.create_access_token(username)
    del _sessions[body.session_id]   # clean up

    user = db.get_user(username)
    return {
        "access_token": token,
        "token_type":   "bearer",
        "username":     username,
        "email":        user["email"],
        "location":     session.get("location", {}),
    }


@router.post("/resend-otp")
async def resend_otp(body: dict):
    session_id = body.get("session_id", "")
    session    = _sessions.get(session_id)
    if not session or session.get("stage") != "face":
        raise HTTPException(400, "Invalid session.")
    username = session["username"]
    user     = db.get_user(username)
    if not user:
        raise HTTPException(404, "User not found.")
    ok = auth.send_otp(username, user["email"])
    if not ok:
        raise HTTPException(500, "Failed to resend OTP.")
    return {"message": "OTP resent successfully."}


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, request: Request):
    """
    Generate a secure reset token (UUID), store with 10-minute expiry,
    and email the link to the registered address.
    Always returns 200 to prevent email enumeration.
    """
    ip       = _client_ip(request)
    location = auth.get_location(ip)
    user     = db.get_user_by_email(str(body.email))
    if user:
        token = auth.generate_reset_token(user["username"])
        es.send_password_reset_email(user["email"], user["username"], token, location)
    return {"message": "If that email is registered, a reset link has been sent."}


@router.get("/validate-reset-token/{token}")
async def validate_reset_token(token: str):
    """Validate that a reset token exists, is unused, and is not expired."""
    username = auth.validate_reset_token(token)
    if not username:
        raise HTTPException(400, "Invalid or expired reset token.")
    return {"valid": True, "username": username}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    """
    Validate token → hash new password with bcrypt → update DB → delete token.
    Token expires in 10 minutes (set at generation time in auth.py).
    """
    if len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    success = auth.reset_password_with_token(body.token, body.new_password)
    if not success:
        raise HTTPException(400, "Invalid or expired reset token.")
    return {"message": "Password reset successfully. You can now log in."}


@router.get("/me")
async def me(username: Annotated[str, Depends(get_current_user)]):
    user = db.get_user(username)
    return {
        "username":   user["username"],
        "email":      user["email"],
        "created_at": user["created_at"],
        "has_face":   user["face_encoding"] is not None,
    }
