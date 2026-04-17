"""
email_service.py
----------------
All email templates for SecureVault (production upgrade).

Improvements in this version:
  - Intruder alert includes: time, exact location, Google Maps link,
    intruder photo attachment, attempt count, device info
  - Password reset link expiry changed to 10 minutes (spec requirement)
  - Full Google Maps link (clickable button) in every location table
  - send_password_reset_notice includes a direct "Reset Now" button
"""

import logging
import os
import smtplib
import ssl
from datetime import datetime
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

SENDER_EMAIL    = os.getenv("SENDER_EMAIL", "")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD", "")
SMTP_HOST       = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT       = int(os.getenv("SMTP_PORT", "465"))
FRONTEND_URL    = os.getenv("FRONTEND_URL", "http://localhost:5173")
APP_NAME        = "SecureVault"

# ── Shared CSS ────────────────────────────────────────────────────────────────
_BASE_STYLE = """
  body{margin:0;padding:0;background:#0f0f1a;font-family:'Inter','Segoe UI',Arial,sans-serif;}
  .wrap{max-width:560px;margin:32px auto;background:#1a1a2e;border-radius:14px;
        overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.6);}
  .header{padding:28px 32px;background:linear-gradient(135deg,#0f3460,#16213e);}
  .header h1{margin:0;font-size:22px;color:#fff;letter-spacing:.5px;}
  .header .badge{display:inline-block;margin-top:6px;padding:3px 10px;
                 border-radius:20px;font-size:11px;font-weight:600;}
  .body{padding:28px 32px;}
  .body p{color:#c0c0d0;font-size:14px;line-height:1.7;margin:8px 0;}
  .kv{width:100%;border-collapse:collapse;margin:16px 0;}
  .kv td{padding:10px 12px;font-size:13px;border-bottom:1px solid #2a2a4a;}
  .kv .label{color:#888;width:130px;font-weight:600;}
  .kv .value{color:#e0e0f0;}
  .otp-box{text-align:center;margin:24px 0;padding:20px;
           background:#0f3460;border-radius:10px;}
  .otp-code{font-size:40px;font-weight:700;letter-spacing:10px;color:#e94560;}
  .btn{display:inline-block;padding:13px 28px;border-radius:8px;
       text-decoration:none;font-weight:700;font-size:14px;margin:12px 0;}
  .btn-danger{background:#e94560;color:#fff;}
  .btn-success{background:#2ecc71;color:#fff;}
  .btn-primary{background:#0f3460;color:#fff;}
  .maps-btn{display:inline-block;margin-top:8px;padding:9px 18px;
            background:#4285F4;color:#fff;border-radius:6px;
            text-decoration:none;font-size:13px;font-weight:600;}
  .footer{padding:16px 32px;background:#111;
          font-size:11px;color:#555;text-align:center;}
  .alert-icon{font-size:48px;text-align:center;margin-bottom:8px;}
  .divider{border:none;border-top:1px solid #2a2a4a;margin:20px 0;}
  .expiry-note{background:#1e1e3a;border:1px solid #3a3a5a;border-radius:8px;
               padding:10px 14px;font-size:12px;color:#aaa;margin-top:12px;}
"""


def _html_wrap(header_html: str, body_html: str, accent: str = "#e94560") -> str:
    return f"""
    <!DOCTYPE html><html><head><style>{_BASE_STYLE}</style></head>
    <body>
      <div class="wrap">
        <div class="header" style="border-bottom:3px solid {accent};">
          <h1>🔐 {APP_NAME}</h1>
          {header_html}
        </div>
        <div class="body">{body_html}</div>
        <div class="footer">
          This is an automated message from {APP_NAME}. Do not reply.<br>
          &copy; {datetime.now().year} {APP_NAME}. All rights reserved.
        </div>
      </div>
    </body></html>
    """


def _location_table(location: dict) -> str:
    """
    Build an HTML table with full location details plus a Google Maps button.
    Accepts the rich dict from auth.get_location():
      city, region, country, lat, lon, isp, maps_url / google_maps_link
    """
    city     = location.get("city",     "Unknown")
    region   = location.get("region",   "Unknown")
    country  = location.get("country",  "Unknown")
    lat      = location.get("lat",      location.get("latitude",  0))
    lon      = location.get("lon",      location.get("longitude", 0))
    isp      = location.get("isp",      "Unknown")
    maps_url = location.get("maps_url", location.get("google_maps_link", ""))
    source   = location.get("source", "unknown").upper()
    accuracy = location.get("accuracy_meters")
    accuracy_row = (
        f'<tr><td class="label">Accuracy</td><td class="value">{accuracy} meters</td></tr>'
        if accuracy is not None else ""
    )

    maps_btn = (
        f'<a href="{maps_url}" class="maps-btn">📍 View on Google Maps</a>'
        if maps_url else ""
    )
    return f"""
    <table class="kv">
      <tr><td class="label">City</td>
          <td class="value"><strong>{city}</strong></td></tr>
      <tr><td class="label">Region</td>
          <td class="value">{region}</td></tr>
      <tr><td class="label">Country</td>
          <td class="value">{country}</td></tr>
      <tr><td class="label">Coordinates</td>
          <td class="value">{lat}, {lon}</td></tr>
      <tr><td class="label">ISP</td>
          <td class="value">{isp}</td></tr>
      <tr><td class="label">Source</td>
          <td class="value">{source}</td></tr>
      {accuracy_row}
    </table>
    {maps_btn}
    """


# ── SMTP helper ───────────────────────────────────────────────────────────────

def _build_smtp() -> smtplib.SMTP_SSL:
    if not SENDER_EMAIL or not SENDER_PASSWORD:
        raise EnvironmentError(
            "SENDER_EMAIL and SENDER_PASSWORD must be set in .env"
        )
    ctx    = ssl.create_default_context()
    server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx)
    server.login(SENDER_EMAIL, SENDER_PASSWORD)
    return server


def _send(msg: MIMEMultipart, receiver: str) -> bool:
    try:
        with _build_smtp() as s:
            s.sendmail(SENDER_EMAIL, receiver, msg.as_string())
        logger.info("Email sent → %s  [%s]", receiver, msg["Subject"])
        return True
    except Exception as exc:
        logger.error("Email to %s failed: %s", receiver, exc)
        return False


# ── Public API ────────────────────────────────────────────────────────────────

def _resolve_image_attachment(image_path: str | None) -> Path | None:
    if not image_path:
        return None

    path = Path(image_path)
    if not path.exists() or not path.is_file():
        logger.warning("Intruder image attachment missing on disk: %s", image_path)
        return None

    return path


def _attach_image(msg: MIMEMultipart, image_path: str | None) -> bool:
    path = _resolve_image_attachment(image_path)
    if not path:
        return False

    try:
        image_bytes = path.read_bytes()
        if not image_bytes:
            logger.warning("Intruder image attachment is empty: %s", image_path)
            return False

        subtype = path.suffix.lower().lstrip(".")
        if subtype == "jpg":
            subtype = "jpeg"

        if subtype:
            img_part = MIMEImage(image_bytes, _subtype=subtype, name=path.name)
        else:
            img_part = MIMEImage(image_bytes, name=path.name)

        img_part.add_header("Content-Disposition", "attachment", filename=path.name)
        msg.attach(img_part)
        return True
    except Exception as exc:
        logger.error("Failed to attach intruder image %s: %s", image_path, exc)
        return False


def send_otp_email(receiver: str, username: str, otp: str) -> bool:
    msg             = MIMEMultipart("alternative")
    msg["From"]     = SENDER_EMAIL
    msg["To"]       = receiver
    msg["Subject"]  = f"[{APP_NAME}] Your One-Time Password"

    html = _html_wrap(
        header_html='<span class="badge" style="background:#e94560;color:#fff;">🔑 OTP Verification</span>',
        body_html=f"""
        <p>Hello <strong style="color:#fff;">{username}</strong>,</p>
        <p>Use the following one-time password to complete your login.</p>
        <div class="otp-box">
          <div style="color:#aaa;font-size:12px;margin-bottom:8px;">YOUR OTP CODE</div>
          <div class="otp-code">{otp}</div>
          <div style="color:#888;font-size:11px;margin-top:10px;">
            Expires in <strong>5 minutes</strong>
          </div>
        </div>
        <p style="color:#888;font-size:12px;">
          ⚠️ Never share this code with anyone. {APP_NAME} will never ask for it.
        </p>
        """,
        accent="#e94560"
    )
    msg.attach(MIMEText(html, "html"))
    return _send(msg, receiver)


def send_intruder_alert(receiver: str, username: str, attempt_no: int,
                        location: dict, image_path: str | None,
                        user_agent: str = "Unknown",
                        event_time: str | None = None) -> bool:
    """
    Full intruder alert email:
      - Username, time, attempt count, device/browser
      - Exact city/region/country/coordinates/ISP
      - Clickable Google Maps link
      - Intruder photo attached (if captured)
    """
    msg             = MIMEMultipart()
    msg["From"]     = SENDER_EMAIL
    msg["To"]       = receiver
    msg["Subject"]  = "🚨 SECURITY ALERT – Unauthorized Access Attempt"

    ts = event_time or datetime.utcnow().strftime("%d %B %Y at %H:%M:%S UTC")
    attachment_path = _resolve_image_attachment(image_path)
    location_display = location.get("display", "Unknown")

    photo_note = (
        '<hr class="divider">'
        '<p style="color:#aaa;font-size:13px;">📷 A photo of the intruder has been attached to this email.</p>'
        if attachment_path else ""
    )

    html = _html_wrap(
        header_html='<span class="badge" style="background:#e94560;color:#fff;">🚨 SECURITY ALERT</span>',
        body_html=f"""
        <div class="alert-icon">⚠️</div>
        <p style="color:#e94560;font-weight:700;font-size:16px;text-align:center;">
          Unauthorized Access Attempt Detected
        </p>
        <hr class="divider">

        <p style="color:#aaa;font-weight:600;font-size:13px;margin-bottom:4px;">
          📋 EVENT DETAILS
        </p>
        <table class="kv">
          <tr><td class="label">Account</td>
              <td class="value" style="color:#e94560;font-weight:700;">{username}</td></tr>
          <tr><td class="label">Time</td>
              <td class="value">{ts}</td></tr>
          <tr><td class="label">Location</td>
              <td class="value">{location_display}</td></tr>
          <tr><td class="label">Attempt Count</td>
              <td class="value" style="color:#f39c12;font-weight:600;">
                {attempt_no} attempt(s)
              </td></tr>
          <tr><td class="label">Device / Browser</td>
              <td class="value" style="font-size:12px;">{user_agent[:100]}</td></tr>
        </table>

        <hr class="divider">
        <p style="color:#aaa;font-weight:600;font-size:13px;margin-bottom:4px;">
          📍 EXACT LOCATION
        </p>
        {_location_table(location)}

        {photo_note}

        <hr class="divider">
        <p style="font-size:12px;color:#888;">
          If this was you, please log in and review your security settings.<br>
          If this was <strong style="color:#e94560;">NOT</strong> you, change your password immediately.
        </p>
        <div style="text-align:center;margin-top:16px;">
          <a href="{FRONTEND_URL}/forgot-password" class="btn btn-danger">
            🔒 Reset My Password Now
          </a>
        </div>
        """,
        accent="#e94560"
    )
    msg.attach(MIMEText(html, "html"))

    if attachment_path:
        _attach_image(msg, str(attachment_path))

    return _send(msg, receiver)


def send_password_reset_email(receiver: str, username: str,
                               reset_token: str, location: dict) -> bool:
    """
    Password reset email.
    Token expires in 10 minutes (set in auth.py RESET_TOKEN_EXPIRY_MIN = 10).
    """
    reset_link      = f"{FRONTEND_URL}/reset-password?token={reset_token}"
    msg             = MIMEMultipart("alternative")
    msg["From"]     = SENDER_EMAIL
    msg["To"]       = receiver
    msg["Subject"]  = f"[{APP_NAME}] Password Reset Request"

    ts = datetime.now().strftime("%d %B %Y at %H:%M:%S UTC")

    html = _html_wrap(
        header_html='<span class="badge" style="background:#f39c12;color:#000;">🔓 Password Reset</span>',
        body_html=f"""
        <p>Hello <strong style="color:#fff;">{username}</strong>,</p>
        <p>A password reset was requested for your account on <strong>{ts}</strong>.</p>

        <table class="kv">
          <tr><td class="label">Requested by</td>
              <td class="value">{username}</td></tr>
          <tr><td class="label">Requested from</td>
              <td class="value">{location.get("display","Unknown")}</td></tr>
        </table>
        {_location_table(location)}

        <hr class="divider">
        <p>Click the button below to set a new password.
           This link expires in <strong style="color:#f39c12;">10 minutes</strong>.</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="{reset_link}" class="btn btn-success">🔑 Reset My Password</a>
        </div>
        <div class="expiry-note">
          ⏱ This link will expire at approximately
          <strong style="color:#e0e0f0;">
            {datetime.now().strftime("%H:%M UTC")} + 10 minutes
          </strong>.
          After expiry you will need to request a new reset link.
        </div>
        <p style="word-break:break-all;font-size:11px;color:#666;margin-top:12px;">
          Or copy this URL: {reset_link}
        </p>
        <hr class="divider">
        <p style="font-size:12px;color:#888;">
          If you did NOT request this reset, you can safely ignore this email.
          Your password will not change unless you click the link above.
        </p>
        """,
        accent="#f39c12"
    )
    msg.attach(MIMEText(html, "html"))
    return _send(msg, receiver)


def send_password_reset_notice(receiver: str, username: str,
                                location: dict) -> bool:
    """
    Notify the verified owner of multiple failures with a direct reset button.
    Sent when max password attempts are reached.
    """
    reset_link      = f"{FRONTEND_URL}/forgot-password"
    msg             = MIMEMultipart("alternative")
    msg["From"]     = SENDER_EMAIL
    msg["To"]       = receiver
    msg["Subject"]  = f"🚨 [{APP_NAME}] Multiple Failed Login Attempts – Action Required"

    ts = datetime.now().strftime("%d %B %Y at %H:%M:%S UTC")

    html = _html_wrap(
        header_html='<span class="badge" style="background:#f39c12;color:#000;">⚠️ Security Notice</span>',
        body_html=f"""
        <p>Hello <strong style="color:#fff;">{username}</strong>,</p>
        <p>Multiple failed password attempts were detected on your account at
           <strong>{ts}</strong>.</p>

        <hr class="divider">
        <p style="color:#aaa;font-weight:600;font-size:13px;margin-bottom:4px;">
          📍 LOCATION OF ATTEMPTS
        </p>
        {_location_table(location)}

        <hr class="divider">
        <p style="color:#e94560;font-weight:600;">
          If this was NOT you, reset your password immediately.
        </p>
        <div style="text-align:center;margin:20px 0;">
          <a href="{reset_link}" class="btn btn-danger">
            🔒 Reset My Password
          </a>
        </div>
        """,
        accent="#f39c12"
    )
    msg.attach(MIMEText(html, "html"))
    return _send(msg, receiver)
