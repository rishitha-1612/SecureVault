"""
routes/vault_routes.py
-----------------------
Secure file vault endpoints (authenticated).
All routes require a valid JWT Bearer token.

  GET    /api/vault/files               - list user's files
  POST   /api/vault/upload              - upload a file
  GET    /api/vault/download/{file_id}  - download a file
  DELETE /api/vault/delete/{file_id}    - delete a file
  GET    /api/vault/stats               - storage stats
"""

import logging
import mimetypes
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import auth
import database as db

logger    = logging.getLogger(__name__)
router    = APIRouter(prefix="/api/vault", tags=["vault"])
bearer    = HTTPBearer(auto_error=False)

VAULT_DIR = Path(__file__).parent.parent / "vault_storage"
MAX_FILE_SIZE = 50 * 1024 * 1024   # 50 MB per file

CATEGORY_MAP = {
    "image":    ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"],
    "document": ["application/pdf", "application/msword",
                 "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                 "text/plain", "text/csv"],
    "video":    ["video/mp4", "video/mpeg", "video/quicktime"],
    "audio":    ["audio/mpeg", "audio/wav", "audio/ogg"],
    "archive":  ["application/zip", "application/x-tar", "application/gzip"],
}


def get_category(mime: str) -> str:
    for cat, mimes in CATEGORY_MAP.items():
        if mime in mimes:
            return cat
    return "other"


# ── Dependency ────────────────────────────────────────────────────────────────

def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
) -> str:
    if not creds:
        raise HTTPException(401, "Not authenticated")
    username = auth.decode_access_token(creds.credentials)
    if not username:
        raise HTTPException(401, "Invalid or expired token")
    return username


# ── Helpers ───────────────────────────────────────────────────────────────────

def user_vault_dir(username: str) -> Path:
    base = VAULT_DIR.resolve()
    d = (base / username).resolve()
    if d != base and base not in d.parents:
        raise HTTPException(400, "Invalid vault path.")
    d.mkdir(parents=True, exist_ok=True)
    return d


def vault_file_path(username: str, stored_name: str) -> Path:
    base = user_vault_dir(username).resolve()
    path = (base / stored_name).resolve()
    if path == base or base not in path.parents:
        raise HTTPException(400, "Invalid file path.")
    return path


def safe_download_name(original_name: str | None) -> str:
    name = (original_name or "download").replace("\\", "/").split("/")[-1].strip()
    name = "".join(ch for ch in name if ch not in "\r\n")
    return name or "download"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/files")
async def list_files(username: Annotated[str, Depends(get_current_user)]):
    """Return metadata for all files belonging to the user."""
    files = db.get_vault_files(username)
    return {"files": files, "count": len(files)}


@router.post("/upload")
async def upload_file(
    username: Annotated[str, Depends(get_current_user)],
    file: UploadFile = File(...),
):
    """Upload a file to the user's vault."""
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, f"File too large. Maximum size is {MAX_FILE_SIZE // 1_000_000} MB.")

    original_name = file.filename or "unnamed"
    ext           = Path(original_name).suffix.lower()
    stored_name   = f"{uuid.uuid4().hex}{ext}"
    mime_type     = file.content_type or mimetypes.guess_type(original_name)[0] or "application/octet-stream"
    file_type     = get_category(mime_type)

    dest = user_vault_dir(username) / stored_name
    dest.write_bytes(content)

    file_id = db.add_vault_file(
        username     = username,
        stored_name  = stored_name,
        original_name= original_name,
        file_type    = file_type,
        mime_type    = mime_type,
        file_size    = len(content),
    )
    file_meta = db.get_vault_file(file_id, username)
    logger.info("Vault upload: user=%s  file=%s  id=%s", username, original_name, file_id)
    return {
        "message":      "File uploaded successfully.",
        "file_id":      file_id,
        "original_name": original_name,
        "file_type":    file_type,
        "file_size":    len(content),
        "file":         file_meta,
    }


@router.get("/download/{file_id}")
async def download_file(
    file_id: int,
    username: Annotated[str, Depends(get_current_user)],
):
    """Stream a vault file back to the authenticated user."""
    meta = db.get_vault_file(file_id, username)
    if not meta:
        raise HTTPException(404, "File not found.")

    path = vault_file_path(username, meta["stored_name"])
    if not path.exists():
        raise HTTPException(404, "File data not found on disk.")

    return FileResponse(
        path         = str(path),
        media_type   = meta["mime_type"] or "application/octet-stream",
        filename     = safe_download_name(meta["original_name"]),
    )


@router.delete("/delete/{file_id}")
async def delete_file(
    file_id: int,
    username: Annotated[str, Depends(get_current_user)],
):
    """Permanently delete a vault file."""
    meta = db.get_vault_file(file_id, username)
    if not meta:
        raise HTTPException(404, "File not found.")

    # Remove from disk
    path = vault_file_path(username, meta["stored_name"])
    if path.exists():
        path.unlink()

    db.delete_vault_file(file_id, username)
    logger.info("Vault delete: user=%s  file_id=%s", username, file_id)
    return {"message": "File deleted successfully."}


@router.get("/stats")
async def vault_stats(username: Annotated[str, Depends(get_current_user)]):
    """Return storage usage stats for the user."""
    files       = db.get_vault_files(username)
    total_bytes = sum(f["file_size"] for f in files)
    by_type     = {}
    for f in files:
        t = f["file_type"]
        by_type[t] = by_type.get(t, 0) + 1

    return {
        "total_files":  len(files),
        "total_bytes":  total_bytes,
        "total_mb":     round(total_bytes / 1_000_000, 2),
        "by_type":      by_type,
    }
