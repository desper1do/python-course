import asyncio
import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import checker, content, db
from fastapi.responses import JSONResponse
from .runner import runner

app = FastAPI()


@app.exception_handler(content.ContentError)
async def content_error(_, exc):
    return JSONResponse({"error": str(exc)}, status_code=422)

db.init()

REASONS = {
    "cpu": "Программа выполнялась слишком долго (больше 5 секунд). Возможно, бесконечный цикл.",
    "memory": "Программа заняла слишком много памяти.",
    "output": "Слишком много вывода — программа остановлена.",
    "stopped": "Остановлено.",
    "idle": "Программа слишком долго ждала ввод и была остановлена.",
    "wall": "Превышено общее время работы.",
}


def lesson_status(l, st, manual):
    try:
        ts = content.tasks(l["id"])
    except (KeyError, content.ContentError):
        ts = []
    req = [t for t in ts if t.get("required", True)]
    solved = [t for t in req if st.get(t["id"], {}).get("status") == "solved"]
    started = any(t["id"] in st for t in ts)
    auto = bool(req) and len(solved) == len(req)
    is_manual = bool(manual.get(l["id"]))
    # «Пройден» — только если решены все required-задачи или стоит ручная отметка
    if auto or is_manual:
        s = "done"
    elif started:
        s = "progress"
    else:
        s = "new"
    return {"status": s, "solved": len(solved), "total": len(req), "manual": is_manual, "auto_done": auto}


@app.get("/api/curriculum")
def get_curriculum():
    cur = content.curriculum()
    st, manual = db.task_statuses(), db.lesson_manual()
    for l in cur["lessons"]:
        l.update(lesson_status(l, st, manual))
    return cur


@app.get("/api/lessons/{lid}")
def get_lesson(lid: str):
    try:
        data = content.lesson(lid)
    except KeyError:
        raise HTTPException(404)
    st = db.task_statuses()
    data["tasks"] = [{**content.public_task(t), "status": st.get(t["id"], {}).get("status", "new"),
                      "attempts": st.get(t["id"], {}).get("attempts", 0),
                      "last_result": st.get(t["id"], {}).get("last_result")} for t in data["tasks"]]
    data["manual"] = bool(db.lesson_manual().get(lid))
    return data


@app.get("/api/code/{key:path}")
def get_code(key: str):
    return {"code": db.get_code(key)}


@app.put("/api/code/{key:path}")
def put_code(key: str, body: dict):
    db.put_code(key, body.get("code", ""))
    return {"ok": True}


@app.get("/api/settings")
def get_settings():
    return db.all_settings()


@app.put("/api/settings")
def put_settings(body: dict):
    db.put_settings(body)
    return {"ok": True}


@app.put("/api/lessons/{lid}/done")
def set_done(lid: str, body: dict):
    db.set_manual(lid, bool(body.get("done")))
    return {"ok": True}


@app.post("/api/check")
async def check(body: dict):
    try:
        lid, task = content.find_task(body["taskId"])
    except KeyError:
        raise HTTPException(404)
    results = await checker.run_tests(runner, body.get("code", ""), task, content.task_files(lid, task))
    solved = bool(results) and all(r["status"] == "ok" for r in results)
    db.record_check(task["id"], solved, results)
    return {"solved": solved, "checker": task.get("checker", "exact"), "results": results}


@app.websocket("/ws/run")
async def ws_run(ws: WebSocket):
    await ws.accept()
    session = None
    task = None

    async def emit(kind, data):
        await ws.send_json({"type": kind, "data": data})

    async def go(msg):
        files = {}
        if msg.get("taskId"):
            try:
                lid, t = content.find_task(msg["taskId"])
                files = content.task_files(lid, t)
            except KeyError:
                pass
        nonlocal session
        session = runner.session(msg.get("code", ""), files, emit, msg.get("stdinPreset") or [])
        res = await session.run()
        await ws.send_json({"type": "exit", "code": res.code, "timeMs": res.time_ms, "reason": res.reason,
                            "message": REASONS.get(res.reason), "error": res.error})

    try:
        while True:
            msg = await ws.receive_json()
            if msg["type"] == "run" and (task is None or task.done()):
                task = asyncio.create_task(go(msg))
            elif msg["type"] == "stdin" and session:
                await session.write(msg["data"])
            elif msg["type"] == "stop" and session:
                session.stop()
    except WebSocketDisconnect:
        pass
    finally:
        if session:
            session.stop()


DIST = Path(os.environ.get("STATIC_DIR", "/app/static"))
if DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = DIST / path
        return FileResponse(f if path and f.is_file() else DIST / "index.html")
