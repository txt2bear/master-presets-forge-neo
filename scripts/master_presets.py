from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from fastapi import Body
from fastapi.responses import JSONResponse

from modules import script_callbacks

EXTENSION_DIR = Path(__file__).resolve().parents[1]
DATA_FILE = EXTENSION_DIR / "master_presets.json"
_LOCK = threading.Lock()
_DEFAULT_DATA: dict[str, Any] = {
    "version": 2,
    "presets": {},
    "quickDimensions": [],
    "presetOrder": [],
    "formatOrder": ["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9"],
}
_KNOWN_FORMATS = set(_DEFAULT_DATA["formatOrder"])


def _clean_quick_dimensions(items: Any) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []

    output: list[dict[str, Any]] = []
    seen: set[tuple[int, int]] = set()

    for item in items:
        if not isinstance(item, dict):
            continue

        width = item.get("width")
        height = item.get("height")
        label = str(item.get("label", "")).strip()

        try:
            width = int(width)
            height = int(height)
        except (TypeError, ValueError):
            continue

        key = (width, height)
        if key in seen:
            continue
        seen.add(key)

        output.append(
            {
                "label": label or f"{width}×{height}",
                "width": width,
                "height": height,
            }
        )

    return output[:16]


def _clean_string_order(items: Any, allowed: set[str] | None) -> list[str]:
    if not isinstance(items, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, str):
            continue
        value = item.strip()
        if not value or value in seen:
            continue
        if allowed is not None and value not in allowed:
            continue
        seen.add(value)
        out.append(value)
    return out


def _load_data() -> dict[str, Any]:
    if not DATA_FILE.exists():
        return dict(_DEFAULT_DATA)

    try:
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return dict(_DEFAULT_DATA)

    if not isinstance(data, dict):
        return dict(_DEFAULT_DATA)

    presets = data.get("presets")
    if not isinstance(presets, dict):
        presets = {}

    quick_dimensions = _clean_quick_dimensions(data.get("quickDimensions"))
    preset_order = _clean_string_order(data.get("presetOrder"), None)
    format_order = _clean_string_order(data.get("formatOrder"), None)

    return {
        "version": 2,
        "presets": presets,
        "quickDimensions": quick_dimensions,
        "presetOrder": preset_order,
        "formatOrder": format_order,
        "formatNames": data.get("formatNames") if isinstance(data.get("formatNames"), dict) else {},
    }


def _save_data(data: dict[str, Any]) -> None:
    payload = {
        "version": 2,
        "presets": data.get("presets", {}) if isinstance(data.get("presets"), dict) else {},
        "quickDimensions": _clean_quick_dimensions(data.get("quickDimensions")),
        "presetOrder": _clean_string_order(data.get("presetOrder"), None),
        "formatOrder": _clean_string_order(data.get("formatOrder"), None),
        "formatNames": data.get("formatNames") if isinstance(data.get("formatNames"), dict) else {},
    }

    temp_file = DATA_FILE.with_suffix(".json.tmp")
    temp_file.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temp_file.replace(DATA_FILE)


def on_app_started(_demo, app) -> None:
    @app.get("/master-presets/data")
    async def master_presets_get_data():
        with _LOCK:
            return JSONResponse(_load_data())

    @app.post("/master-presets/data")
    async def master_presets_set_data(payload: dict = Body(...)):
        presets = payload.get("presets") if isinstance(payload, dict) else None
        if not isinstance(presets, dict):
            return JSONResponse(
                {"ok": False, "error": "Invalid presets payload"},
                status_code=400,
            )

        quick_dimensions = payload.get("quickDimensions") if isinstance(payload, dict) else []

        with _LOCK:
            _save_data(
                {
                    "version": 2,
                    "presets": presets,
                    "quickDimensions": quick_dimensions,
                    "presetOrder": payload.get("presetOrder"),
                    "formatOrder": payload.get("formatOrder"),
                    "formatNames": payload.get("formatNames"),
                }
            )

        return {
            "ok": True,
            "count": len(presets),
            "quick_dimensions": len(_clean_quick_dimensions(quick_dimensions)),
        }


script_callbacks.on_app_started(on_app_started)
