"""Загрузка контента с диска. Устойчива к недописанному контенту: ошибки возвращаются как данные."""
import os
import re
from pathlib import Path

import yaml

CONTENT = Path(os.environ.get("CONTENT_DIR", "/app/content"))
_cache: dict = {}  # path -> (mtime, value)


class ContentError(Exception):
    pass


def _read_yaml(p: Path, default):
    if not p.is_file():
        return default
    m = p.stat().st_mtime_ns
    hit = _cache.get(p)
    if hit and hit[0] == m:
        return hit[1]
    try:
        v = yaml.safe_load(p.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        raise ContentError(f"Ошибка YAML в {p.relative_to(CONTENT)}: {e}")
    v = default if v is None else v
    _cache[p] = (m, v)
    return v


def curriculum():
    cur = _read_yaml(CONTENT / "curriculum.yaml", {})
    if not isinstance(cur, dict):
        raise ContentError("curriculum.yaml должен быть словарём с ключами blocks и lessons")
    blocks = cur.get("blocks") or []
    lessons = [l for l in (cur.get("lessons") or []) if isinstance(l, dict) and l.get("id")]
    return {"blocks": blocks, "lessons": [dict(l) for l in lessons]}


def lesson_dir(lid):
    if not re.fullmatch(r"[\w-]+", lid):
        raise KeyError(lid)
    d = CONTENT / "lessons" / lid
    if not d.is_dir():
        raise KeyError(lid)
    return d


def split_front(text):
    m = re.match(r"---\n(.*?)\n---\n(.*)", text, re.S)
    if m:
        try:
            return yaml.safe_load(m.group(1)) or {}, m.group(2)
        except yaml.YAMLError:
            return {}, m.group(2)
    return {}, text


def tasks(lid):
    v = _read_yaml(lesson_dir(lid) / "tasks.yaml", [])
    if not isinstance(v, list):
        raise ContentError(f"tasks.yaml урока {lid} должен быть списком")
    return [t for t in v if isinstance(t, dict) and t.get("id")]


def lesson(lid):
    d = lesson_dir(lid)
    f = d / "lesson.md"
    meta, body = split_front(f.read_text(encoding="utf-8")) if f.is_file() else ({}, "_Теория пока не написана._")
    return {"meta": meta, "markdown": body, "tasks": tasks(lid)}


def teacher(lid):
    f = lesson_dir(lid) / "teacher.md"
    return f.read_text(encoding="utf-8") if f.exists() else ""


def find_task(tid):
    for l in curriculum()["lessons"]:
        try:
            for t in tasks(l["id"]):
                if t["id"] == tid:
                    return l["id"], t
        except (KeyError, ContentError):
            continue
    raise KeyError(tid)


def task_files(lid, t):
    out = {}
    base = lesson_dir(lid).resolve()
    for rel in t.get("files", []) or []:
        p = (base / rel).resolve()
        if str(p).startswith(str(base)) and p.is_file():
            out[Path(rel).name] = p.read_bytes()
    return out


def public_task(t):
    """Без solution, explanation, answer и скрытых тестов."""
    keep = ["id", "type", "title", "level", "required", "statement", "input_format", "output_format", "starter", "examples", "hints", "mcko"]
    d = {k: t.get(k) for k in keep if k in t}
    d["title"] = d.get("title") or t["id"]
    d["statement"] = d.get("statement") or ""
    d["has_tests"] = bool(t.get("tests")) and t.get("type", "code") == "code"
    return d
