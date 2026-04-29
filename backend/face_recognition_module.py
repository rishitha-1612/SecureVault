"""
face_recognition_module.py
--------------------------
Face recognition helpers adapted for the REST API.
All functions accept raw bytes (from multipart uploads)
instead of live OpenCV captures.
"""

import cv2
import json
import logging
import numpy as np
from datetime import datetime
from pathlib import Path

import face_recognition as fr

logger        = logging.getLogger(__name__)
INTRUDER_DIR  = Path(__file__).parent / "intruder_images"
TOLERANCE = 0.50
DETECTION_SIZE = (640, 480)
DETECTION_MODEL = "hog"
DETECTION_UPSAMPLE = 1


def _bytes_to_frame(image_bytes: bytes) -> np.ndarray | None:
    """Decode raw JPEG/PNG bytes into a BGR numpy array."""
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return frame
    except Exception as exc:
        logger.error("_bytes_to_frame error: %s", exc)
        return None


def _prepare_detection_frame(frame: np.ndarray) -> np.ndarray:
    """Resize frames before face detection to keep authentication responsive."""
    try:
        height, width = frame.shape[:2]
        target_width, target_height = DETECTION_SIZE

        if width <= target_width and height <= target_height:
            return frame

        return cv2.resize(frame, DETECTION_SIZE, interpolation=cv2.INTER_AREA)
    except Exception as exc:
        logger.warning("_prepare_detection_frame resize fallback: %s", exc)
        return frame


def get_face_encoding_from_bytes(image_bytes: bytes) -> list | None:
    """
    Accept raw image bytes, return 128-float face encoding or None.
    Works for both registration and live login.
    """
    try:
        frame = _bytes_to_frame(image_bytes)
        if frame is None:
            return None
        detection_frame = _prepare_detection_frame(frame)
        rgb       = cv2.cvtColor(detection_frame, cv2.COLOR_BGR2RGB)
        locations = fr.face_locations(
            rgb,
            number_of_times_to_upsample=DETECTION_UPSAMPLE,
            model=DETECTION_MODEL,
        )
        if not locations:
            return None
        encodings = fr.face_encodings(rgb, locations)
        return encodings[0].tolist() if encodings else None
    except Exception as exc:
        logger.error("get_face_encoding_from_bytes error: %s", exc)
        return None


def match_face(live_encoding: list, stored_encoding_json: str) -> bool:
    """
    Compare a live encoding against a stored JSON encoding.
    Returns True if they match within TOLERANCE.
    """
    try:
        stored     = json.loads(stored_encoding_json)
        live_arr   = np.array(live_encoding)
        stored_arr = np.array(stored)
        results    = fr.compare_faces([stored_arr], live_arr, tolerance=TOLERANCE)
        return bool(results[0])
    except Exception as exc:
        logger.error("match_face error: %s", exc)
        return False


def save_intruder_image_from_bytes(image_bytes: bytes, username: str) -> str | None:
    """Save intruder image bytes to disk and return the file path."""
    INTRUDER_DIR.mkdir(parents=True, exist_ok=True)
    ts       = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    filename = INTRUDER_DIR / f"intruder_{username}_{ts}.jpg"
    frame    = _bytes_to_frame(image_bytes)
    if frame is None:
        logger.error("Intruder image capture failed: frame decode returned None")
        return None

    saved = cv2.imwrite(str(filename), frame)
    if not saved or not filename.exists():
        logger.error("Intruder image capture failed: could not write %s", filename)
        return None

    logger.info("Intruder image saved: %s", filename)
    return str(filename)


def draw_face_boxes_on_bytes(image_bytes: bytes) -> bytes:
    """
    Detect faces, draw green boxes, return JPEG bytes.
    Used by the live preview endpoint if desired.
    """
    try:
        frame  = _bytes_to_frame(image_bytes)
        detection_frame = _prepare_detection_frame(frame)
        rgb    = cv2.cvtColor(detection_frame, cv2.COLOR_BGR2RGB)
        locs = fr.face_locations(
            rgb,
            number_of_times_to_upsample=DETECTION_UPSAMPLE,
            model=DETECTION_MODEL,
        )
        for top, right, bottom, left in locs:
            cv2.rectangle(detection_frame, (left, top), (right, bottom), (0, 220, 0), 2)
        _, buf = cv2.imencode(".jpg", detection_frame)
        return buf.tobytes()
    except Exception as exc:
        logger.error("draw_face_boxes_on_bytes error: %s", exc)
        return image_bytes
