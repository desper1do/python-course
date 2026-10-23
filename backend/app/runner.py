"""Запуск пользовательского Python-кода.

`Runner` — интерфейс. Текущая реализация `SubprocessRunner` — процесс `python3 -u -B`
с rlimit-ограничениями. Для выкладки на сервер её можно заменить реализацией,
которая ходит в отдельный контейнер-раннер без сети (см. README).
"""
from __future__ import annotations

import asyncio
import os
import re
import resource
import shutil
import signal
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Awaitable, Callable, Optional, Protocol

CPU_SECONDS = int(os.environ.get("RUNNER_CPU", "5"))
MEMORY_BYTES = int(os.environ.get("RUNNER_MEM_MB", "256")) * 1024 * 1024
MAX_PROCS = int(os.environ.get("RUNNER_NPROC", "256"))
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_OUTPUT = int(os.environ.get("RUNNER_MAX_OUTPUT", str(200 * 1024)))
IDLE_SECONDS = int(os.environ.get("RUNNER_IDLE", str(15 * 60)))
WALL_SECONDS = int(os.environ.get("RUNNER_WALL", str(60 * 60)))

Emit = Callable[[str, str], Awaitable[None]]  # (kind: stdout|stderr|echo, data)

_TB_LINE = re.compile(r'File "[^"]*main\.py", line (\d+)')
_ERR_LINE = re.compile(r"^([A-Za-z_][A-Za-z0-9_.]*(?:Error|Exception|Interrupt|Exit|Warning)):?\s*(.*)$")


def _limits() -> None:
    resource.setrlimit(resource.RLIMIT_CPU, (CPU_SECONDS, CPU_SECONDS + 1))
    resource.setrlimit(resource.RLIMIT_AS, (MEMORY_BYTES, MEMORY_BYTES))
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_FILE_BYTES, MAX_FILE_BYTES))
    resource.setrlimit(resource.RLIMIT_NPROC, (MAX_PROCS, MAX_PROCS))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


@dataclass
class RunResult:
    stdout: str = ""
    stderr: str = ""
    code: int = 0
    time_ms: int = 0
    reason: str = "ok"  # ok | error | cpu | memory | output | stopped | idle | wall | timeout
    error: Optional[dict] = None  # {type, line, message}


def parse_error(stderr: str) -> Optional[dict]:
    """Достаёт тип ошибки, строку и сообщение из traceback."""
    text = stderr.strip()
    if not text:
        return None
    lines = text.splitlines()
    err_type = message = None
    for ln in reversed(lines):
        m = _ERR_LINE.match(ln.strip())
        if m:
            err_type, message = m.group(1), m.group(2)
            break
    if err_type is None:
        return None
    line_no = None
    for m in _TB_LINE.finditer(text):
        line_no = int(m.group(1))
    return {"type": err_type.split(".")[-1], "line": line_no, "message": message}


def _prepare_dir(code: str, files: dict[str, bytes]) -> str:
    cwd = tempfile.mkdtemp(prefix="run_")
    Path(cwd, "main.py").write_text(code, encoding="utf-8")
    for name, data in files.items():
        dest = Path(cwd, name)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    os.chmod(cwd, 0o700)
    return cwd


def _spawn(cwd: str):
    return asyncio.create_subprocess_exec(
        sys.executable, "-u", "-B", "main.py",
        cwd=cwd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={"PYTHONIOENCODING": "utf-8", "PYTHONDONTWRITEBYTECODE": "1", "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"},
        preexec_fn=_limits,
        start_new_session=True,
    )


def _kill(proc: asyncio.subprocess.Process) -> None:
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        try:
            proc.kill()
        except ProcessLookupError:
            pass


def _waiting_for_stdin(pid: int) -> bool:
    """Процесс спит в read(0)? Если /proc недоступен, считаем по состоянию S."""
    try:
        stat = Path(f"/proc/{pid}/stat").read_text()
        state = stat.rsplit(")", 1)[1].split()[0]
    except (OSError, IndexError):
        return False
    if state != "S":
        return False
    try:
        sc = Path(f"/proc/{pid}/syscall").read_text().split()
        if sc and sc[0].isdigit():
            return sc[0] == "0" and int(sc[1], 16) == 0
    except (OSError, ValueError, IndexError):
        pass
    return True


def _finish_reason(returncode: int, stderr: str, base: str) -> str:
    if base != "ok":
        return base
    if returncode in (-signal.SIGXCPU, -signal.SIGKILL) and "Traceback" not in stderr:
        return "cpu"
    if "MemoryError" in stderr:
        return "memory"
    if returncode != 0:
        return "error"
    return "ok"


class Runner(Protocol):
    async def run_batch(self, code: str, files: dict[str, bytes], stdin: str, timeout: float) -> RunResult: ...
    def session(self, code: str, files: dict[str, bytes], emit: Emit, preset: list[str]) -> "Session": ...


class Session:
    """Интерактивный запуск: вывод идёт в emit, ввод — через write()."""

    def __init__(self, code: str, files: dict[str, bytes], emit: Emit, preset: list[str]):
        self.code, self.files, self.emit = code, files, emit
        self.preset = list(preset)
        self.proc: Optional[asyncio.subprocess.Process] = None
        self.cwd: Optional[str] = None
        self._stop_requested = False
        self._reason = "ok"
        self._out_total = 0
        self._last_activity = time.monotonic()
        self._stderr_buf = ""
        self._stderr_all = ""

    async def write(self, data: str) -> None:
        if self.proc and self.proc.stdin and not self.proc.stdin.is_closing():
            self._last_activity = time.monotonic()
            try:
                self.proc.stdin.write(data.encode("utf-8"))
                await self.proc.stdin.drain()
            except (BrokenPipeError, ConnectionResetError):
                pass

    def stop(self) -> None:
        self._stop_requested = True
        self._reason = "stopped"
        if self.proc:
            _kill(self.proc)

    async def _pump(self, stream: asyncio.StreamReader, kind: str) -> None:
        while True:
            chunk = await stream.read(4096)
            if not chunk:
                break
            self._last_activity = time.monotonic()
            text = chunk.decode("utf-8", errors="replace")
            if self._out_total >= MAX_OUTPUT:
                continue
            room = MAX_OUTPUT - self._out_total
            if len(text) > room:
                text = text[:room]
            self._out_total += len(text)
            if kind == "stderr":
                self._stderr_all += text
                self._stderr_buf += text.replace((self.cwd or "\0") + "/", "")
                *done, self._stderr_buf = self._stderr_buf.split("\n")
                if done:
                    await self.emit("stderr", "\n".join(done) + "\n")
            else:
                await self.emit("stdout", text)
            if self._out_total >= MAX_OUTPUT:
                self._reason = "output"
                if self.proc:
                    _kill(self.proc)

    async def _feeder(self) -> None:
        """Подаёт preset-строки, когда программа реально ждёт ввод."""
        quiet_since = None
        while self.preset and self.proc and self.proc.returncode is None:
            await asyncio.sleep(0.05)
            if _waiting_for_stdin(self.proc.pid) and time.monotonic() - self._last_activity > 0.05:
                quiet_since = quiet_since or time.monotonic()
                if time.monotonic() - quiet_since > 0.05:
                    line = self.preset.pop(0)
                    await self.emit("echo", line + "\n")
                    await self.write(line + "\n")
                    quiet_since = None
            else:
                quiet_since = None

    async def _watchdog(self) -> None:
        start = time.monotonic()
        while self.proc and self.proc.returncode is None:
            await asyncio.sleep(0.5)
            now = time.monotonic()
            if now - self._last_activity > IDLE_SECONDS:
                self._reason = "idle"
                _kill(self.proc)
            elif now - start > WALL_SECONDS:
                self._reason = "wall"
                _kill(self.proc)

    async def run(self) -> RunResult:
        t0 = time.monotonic()
        self.cwd = _prepare_dir(self.code, self.files)
        try:
            self.proc = await _spawn(self.cwd)
            tasks = [
                asyncio.create_task(self._pump(self.proc.stdout, "stdout")),
                asyncio.create_task(self._pump(self.proc.stderr, "stderr")),
                asyncio.create_task(self._watchdog()),
                asyncio.create_task(self._feeder()),
            ]
            await self.proc.wait()
            await asyncio.gather(tasks[0], tasks[1])
            for t in tasks[2:]:
                t.cancel()
            if self._stderr_buf:
                await self.emit("stderr", self._stderr_buf)
            rc = self.proc.returncode
            stderr = self._stderr_all.replace(self.cwd + "/", "")
            reason = _finish_reason(rc, stderr, self._reason)
            return RunResult(
                stdout="", stderr=stderr, code=rc, reason=reason,
                time_ms=int((time.monotonic() - t0) * 1000), error=parse_error(stderr),
            )
        finally:
            shutil.rmtree(self.cwd, ignore_errors=True)


class SubprocessRunner:
    def session(self, code, files, emit, preset):
        return Session(code, files, emit, preset)

    async def run_batch(self, code: str, files: dict[str, bytes], stdin: str, timeout: float = 3.0) -> RunResult:
        t0 = time.monotonic()
        cwd = _prepare_dir(code, files)
        try:
            proc = await _spawn(cwd)
            reason = "ok"
            try:
                out, err = await asyncio.wait_for(proc.communicate(stdin.encode("utf-8")), timeout)
            except asyncio.TimeoutError:
                _kill(proc)
                out, err = b"", b""
                try:
                    out, err = await asyncio.wait_for(proc.communicate(), 2)
                except Exception:
                    pass
                reason = "timeout"
            stdout = out[:MAX_OUTPUT].decode("utf-8", errors="replace")
            stderr = err[:MAX_OUTPUT].decode("utf-8", errors="replace").replace(cwd + "/", "")
            rc = proc.returncode if proc.returncode is not None else -9
            if reason == "ok":
                reason = _finish_reason(rc, stderr, "ok")
            if reason == "cpu":
                reason = "timeout"
            return RunResult(
                stdout=stdout, stderr=stderr, code=rc, reason=reason,
                time_ms=int((time.monotonic() - t0) * 1000), error=parse_error(stderr),
            )
        finally:
            shutil.rmtree(cwd, ignore_errors=True)


runner: Runner = SubprocessRunner()
