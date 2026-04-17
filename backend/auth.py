"""
auth.py
-------
Authentication logic for SecureVault (production upgrade):
  - bcrypt password hashing / verification
  - OTP generation + email dispatch
  - Accurate geolocation via ip-api.com (city / region / country / lat / lon)
    with automatic public-IP fallback when running on localhost
  - JWT access token creation + validation
  - Password reset token generation
  - Multi-factor orchestration
"""

import logging
import os
import random
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import requests
from jose import JWTError, jwt

import database as db
import email_service as es
import face_recognition_module as frm

logger = logging.getLogger(__name__)

SECRET_KEY             = os.getenv("JWT_SECRET_KEY", "CHANGE_ME_IN_PRODUCTION_32chars!")
ALGORITHM              = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8   # 8 hours

MAX_ATTEMPTS           = 3
OTP_EXPIRY_MINUTES     = 5
RESET_TOKEN_EXPIRY_MIN = 10            # 10 minutes (spec requirement)
LOCKOUT_SECONDS        = 30            # 30-second account lockout after 3 failures
LOCKOUT_WINDOW_MINUTES = 30

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
OPENCAGE_API_KEY = os.getenv("OPENCAGE_API_KEY", "")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

# Private/local IP prefixes that ip-api.com cannot resolve
_PRIVATE_PREFIXES = ("10.", "172.16.", "172.17.", "172.18.", "172.19.",
                     "172.20.", "172.21.", "172.22.", "172.23.", "172.24.",
                     "172.25.", "172.26.", "172.27.", "172.28.", "172.29.",
                     "172.30.", "172.31.", "192.168.")
_LOCAL_IPS = {"127.0.0.1", "::1", "localhost", "0.0.0.0", "", None}


# ── Password ──────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception as exc:
        logger.error("Password verification error: %s", exc)
        return False


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(username: str) -> str:
    expire  = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": username, "exp": expire, "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> str | None:
    """Return username from a valid JWT or None if invalid/expired."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


# ── OTP ───────────────────────────────────────────────────────────────────────

def generate_otp(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


def send_otp(username: str, email: str) -> bool:
    otp = generate_otp()
    expires_at = (
        datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES)
    ).strftime("%Y-%m-%d %H:%M:%S")
    db.store_otp(username, otp, expires_at)
    return es.send_otp_email(email, username, otp)


def validate_otp(username: str, token: str) -> bool:
    return db.verify_otp(username, token.strip())


# ── Password Reset ────────────────────────────────────────────────────────────

def generate_reset_token(username: str) -> str:
    """Create a UUID reset token, store it with 10-min expiry, return the raw token."""
    token      = str(uuid.uuid4())
    expires_at = (
        datetime.utcnow() + timedelta(minutes=RESET_TOKEN_EXPIRY_MIN)
    ).strftime("%Y-%m-%d %H:%M:%S")
    db.store_reset_token(username, token, expires_at)
    return token


def validate_reset_token(token: str) -> str | None:
    """Return the associated username if token is valid and not expired, else None."""
    row = db.get_reset_token(token)
    return row["username"] if row else None


def reset_password_with_token(token: str, new_password: str) -> bool:
    """Validate token, update password, delete token. Returns True on success."""
    username = validate_reset_token(token)
    if not username:
        return False
    if len(new_password) < 8:
        return False
    db.update_password(username, hash_password(new_password))
    db.mark_reset_token_used(token)
    return True


# ── Geolocation ───────────────────────────────────────────────────────────────

def _is_private_ip(ip: str | None) -> bool:
    """Return True if the IP is localhost or a private network address."""
    if ip in _LOCAL_IPS:
        return True
    if ip and any(ip.startswith(p) for p in _PRIVATE_PREFIXES):
        return True
    return False


def _fetch_public_ip() -> str:
    """Attempt to fetch the server's own public IP via ipify."""
    try:
        r = requests.get("https://api.ipify.org?format=json", timeout=4)
        return r.json().get("ip", "")
    except Exception:
        pass
    try:
        # Fallback: ip-api without a parameter resolves the calling machine's IP
        r = requests.get("http://ip-api.com/json/", timeout=4)
        d = r.json()
        if d.get("status") == "success":
            return d.get("query", "")
    except Exception:
        pass
    return ""


def _empty_location(source: str = "unknown", error: str | None = None) -> dict:
    data = {
        "city": "Unknown", "region": "Unknown", "country": "Unknown",
        "lat": 0.0, "lon": 0.0, "latitude": 0.0, "longitude": 0.0,
        "isp": "Unknown", "maps_url": "", "google_maps_link": "",
        "display": "Unknown", "source": source,
    }
    if error:
        data["error"] = error
    return data


def _coerce_coord(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _build_gps_location(lat: float, lon: float, city: str = "Unknown",
                        region: str = "Unknown", country: str = "Unknown",
                        source: str = "gps", accuracy: float | None = None) -> dict:
    maps_url = f"https://www.google.com/maps?q={lat},{lon}"
    display_parts = [p for p in (city, region, country) if p and p != "Unknown"]
    display = ", ".join(display_parts) if display_parts else f"{lat}, {lon}"
    data = {
        "city": city or "Unknown",
        "region": region or "Unknown",
        "country": country or "Unknown",
        "lat": lat,
        "lon": lon,
        "latitude": lat,
        "longitude": lon,
        "isp": "Browser GPS",
        "maps_url": maps_url,
        "google_maps_link": maps_url,
        "display": display,
        "source": source,
    }
    if accuracy is not None:
        data["accuracy_meters"] = accuracy
    return data


def _reverse_geocode_opencage(lat: float, lon: float, accuracy: float | None) -> dict | None:
    if not OPENCAGE_API_KEY:
        return None
    try:
        r = requests.get(
            "https://api.opencagedata.com/geocode/v1/json",
            params={"q": f"{lat},{lon}", "key": OPENCAGE_API_KEY, "no_annotations": 1},
            timeout=6,
        )
        r.raise_for_status()
        results = r.json().get("results", [])
        if not results:
            return None
        components = results[0].get("components", {})
        city = (
            components.get("city") or components.get("town") or
            components.get("village") or components.get("municipality") or
            components.get("county") or "Unknown"
        )
        region = components.get("state") or components.get("region") or "Unknown"
        country = components.get("country") or "Unknown"
        return _build_gps_location(lat, lon, city, region, country, "gps-opencage", accuracy)
    except Exception as exc:
        logger.warning("OpenCage reverse geocoding failed: %s", exc)
        return None


def _reverse_geocode_google(lat: float, lon: float, accuracy: float | None) -> dict | None:
    if not GOOGLE_MAPS_API_KEY:
        return None
    try:
        r = requests.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"latlng": f"{lat},{lon}", "key": GOOGLE_MAPS_API_KEY},
            timeout=6,
        )
        r.raise_for_status()
        results = r.json().get("results", [])
        if not results:
            return None
        components = results[0].get("address_components", [])

        def pick(*types):
            for comp in components:
                if any(t in comp.get("types", []) for t in types):
                    return comp.get("long_name")
            return None

        city = pick("locality", "postal_town", "administrative_area_level_2") or "Unknown"
        region = pick("administrative_area_level_1") or "Unknown"
        country = pick("country") or "Unknown"
        return _build_gps_location(lat, lon, city, region, country, "gps-google", accuracy)
    except Exception as exc:
        logger.warning("Google reverse geocoding failed: %s", exc)
        return None


def _reverse_geocode_nominatim(lat: float, lon: float, accuracy: float | None) -> dict | None:
    try:
        r = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"format": "jsonv2", "lat": lat, "lon": lon, "zoom": 10, "addressdetails": 1},
            headers={"User-Agent": "SecureVault/2.0 security-alert-geocoder"},
            timeout=6,
        )
        r.raise_for_status()
        address = r.json().get("address", {})
        city = (
            address.get("city") or address.get("town") or address.get("village") or
            address.get("municipality") or address.get("county") or "Unknown"
        )
        region = address.get("state") or address.get("region") or "Unknown"
        country = address.get("country") or "Unknown"
        return _build_gps_location(lat, lon, city, region, country, "gps-nominatim", accuracy)
    except Exception as exc:
        logger.warning("Nominatim reverse geocoding failed: %s", exc)
        return None


def reverse_geocode_coordinates(latitude, longitude, accuracy: float | None = None) -> dict | None:
    lat = _coerce_coord(latitude)
    lon = _coerce_coord(longitude)
    if lat is None or lon is None:
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return (
        _reverse_geocode_opencage(lat, lon, accuracy) or
        _reverse_geocode_google(lat, lon, accuracy) or
        _reverse_geocode_nominatim(lat, lon, accuracy) or
        _build_gps_location(lat, lon, source="gps", accuracy=accuracy)
    )


def get_location(ip: str | None = None, latitude=None, longitude=None,
                 accuracy: float | None = None,
                 permission: str | None = None) -> dict:
    """
    Return structured location data using hybrid tracking.

    Browser GPS coordinates are always preferred. If reverse geocoding keys are
    configured, coordinates are converted to city/region/country. IP lookup is
    used only when GPS is missing, invalid, or denied by the browser.
    """
    gps_location = reverse_geocode_coordinates(latitude, longitude, accuracy)
    if gps_location:
        gps_location["permission"] = permission or "granted"
        return gps_location

    try:
        resolved_ip = ip
        if _is_private_ip(ip):
            logger.debug("Private/local IP (%s) - fetching public IP for geolocation", ip)
            resolved_ip = _fetch_public_ip()

        url = f"http://ip-api.com/json/{resolved_ip}" if resolved_ip else "http://ip-api.com/json/"
        r   = requests.get(url, timeout=5)
        d   = r.json()

        if d.get("status") == "success":
            lat      = d.get("lat", 0.0)
            lon      = d.get("lon", 0.0)
            city     = d.get("city", "Unknown")
            region   = d.get("regionName", "Unknown")
            country  = d.get("country", "Unknown")
            isp      = d.get("isp", "Unknown")
            maps_url = f"https://www.google.com/maps?q={lat},{lon}"
            return {
                "city":             city,
                "region":           region,
                "country":          country,
                "lat":              lat,
                "lon":              lon,
                "latitude":         lat,
                "longitude":        lon,
                "isp":              isp,
                "maps_url":         maps_url,
                "google_maps_link": maps_url,
                "display":          f"{city}, {region}, {country}",
                "source":           "ip",
                "permission":       permission or "unavailable",
            }
        logger.warning("ip-api.com returned status=%s for IP=%s", d.get("status"), resolved_ip)
    except Exception as exc:
        logger.warning("Geolocation lookup failed: %s", exc)

    return _empty_location("unknown", "Location unavailable")


# ── Registration ──────────────────────────────────────────────────────────────

class RegistrationError(Exception):
    pass


def register_user(username: str, email: str, plain_password: str,
                  face_frame) -> None:
    username = username.strip().lower()
    email    = email.strip().lower()

    if not username or not email or not plain_password:
        raise RegistrationError("Username, email, and password are all required.")
    if len(plain_password) < 8:
        raise RegistrationError("Password must be at least 8 characters.")

    face_encoding = None
    if face_frame is not None:
        face_encoding = frm.get_face_encoding_from_bytes(face_frame)
        if face_encoding is None:
            raise RegistrationError(
                "No face detected in the captured image. "
                "Ensure your face is clearly visible and try again."
            )

    pw_hash = hash_password(plain_password)
    if not db.create_user(username, email, pw_hash, face_encoding):
        raise RegistrationError("Username or email already exists.")


# ── Auth Result ───────────────────────────────────────────────────────────────

class AuthResult:
    def __init__(self, success: bool, message: str, data: dict | None = None):
        self.success = success
        self.message = message
        self.data    = data or {}

    def __bool__(self):
        return self.success


# ── Stage Checks ─────────────────────────────────────────────────────────────

def check_lockout(username: str) -> AuthResult | None:
    if db.is_locked_out(username):
        remaining = db.get_lockout_remaining_seconds(username)
        return AuthResult(
            False,
            f"Account locked. Try again in {remaining} second(s).",
            {"locked": True, "lockout_remaining": remaining}
        )
    return None


def authenticate_password(username: str, plain_password: str,
                           attempt_no: int, location: dict,
                           ip: str = None, user_agent: str = None) -> AuthResult:
    user = db.get_user(username)
    if user is None:
        return AuthResult(False, "Invalid username.")

    loc_str = location.get("display", "Unknown")

    if verify_password(plain_password, user["password_hash"]):
        db.log_attempt(username, "success", stage="password",
                       location=loc_str, location_dict=location,
                       attempt_no=attempt_no, ip_address=ip, user_agent=user_agent)
        return AuthResult(True, "Password accepted.", {"user": dict(user)})

    db.log_attempt(username, "fail", stage="password",
                   location=loc_str, location_dict=location,
                   attempt_no=attempt_no, ip_address=ip, user_agent=user_agent)
    return AuthResult(False, "Incorrect password.")


def authenticate_face(username: str, image_bytes: bytes,
                       location: dict) -> AuthResult:
    user          = db.get_user(username)
    loc_str       = location.get("display", "Unknown")
    live_encoding = frm.get_face_encoding_from_bytes(image_bytes)

    if live_encoding is None:
        db.log_attempt(username, "fail", stage="face",
                       location=loc_str, location_dict=location)
        return AuthResult(
            False,
            "No face detected. Look directly at the camera.",
            {"trigger_intruder_alert": False},
        )

    if user["face_encoding"] is None:
        return AuthResult(True, "No face on file – face check skipped.")

    if frm.match_face(live_encoding, user["face_encoding"]):
        db.log_attempt(username, "success", stage="face",
                       location=loc_str, location_dict=location)
        return AuthResult(True, "Face recognised.")

    # ── Intruder: save the submitted image ────────────────────────────────────
    img_path = frm.save_intruder_image_from_bytes(image_bytes, username)
    db.log_attempt(username, "intruder", stage="face",
                   location=loc_str, location_dict=location, image_path=img_path)
    attempt_count = db.count_recent_failures(username, minutes=30)
    return AuthResult(False, "Face does not match records.",
                      {
                          "image_path": img_path,
                          "attempt_count": max(1, attempt_count),
                          "trigger_intruder_alert": True,
                      })


def authenticate_otp(username: str, token: str) -> AuthResult:
    if validate_otp(username, token):
        db.log_attempt(username, "success", stage="otp")
        return AuthResult(True, "OTP verified.")
    db.log_attempt(username, "fail", stage="otp")
    return AuthResult(False, "Invalid or expired OTP.")
