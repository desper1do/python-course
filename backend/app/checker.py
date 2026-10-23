import asyncio

from . import config


def _lines(s):
    return "\n".join(l.rstrip() for l in s.replace("\r\n", "\n").rstrip().split("\n"))


def same(actual, expected, mode="exact"):
    if mode == "tokens":
        return actual.split() == expected.split()
    if mode == "float":
        a, e = actual.split(), expected.split()
        if len(a) != len(e):
            return False
        try:
            return all(abs(float(x) - float(y)) <= 1e-6 * max(1, abs(float(y))) for x, y in zip(a, e))
        except ValueError:
            return False
    return _lines(actual) == _lines(expected)


TIMEOUT_MESSAGE = "Программа работала слишком долго (больше {sec:g} с). Возможно, бесконечный цикл."


def _clip_tail(text, limit):
    """Обрезает начало: в traceback самое важное — в конце."""
    return text if len(text) <= limit else "…\n" + text[-limit:]


def _clip_head(text, limit):
    return text if len(text) <= limit else text[:limit] + "\n… (вывод обрезан)"


async def run_tests(runner, code, task, files):
    """Прогоняет все тесты (не останавливаясь на первом упавшем)."""
    mode = task.get("checker", "exact")
    sem = asyncio.Semaphore(config.TEST_PARALLEL)

    async def one(i, t):
        async with sem:
            return await _one(runner, code, files, mode, i, t)

    return list(await asyncio.gather(*(one(i, t) for i, t in enumerate(task.get("tests", []) or []))))


async def _one(runner, code, files, mode, i, t):
    """Один тест. Раскрытие скрытых — по config.HIDDEN_TESTS_REVEAL."""
    expected = str(t.get("output", ""))
    r = await runner.run_batch(code, files, str(t.get("input", "")), config.TEST_TIMEOUT)
    if r.reason == "timeout":
        status = "timeout"
    elif r.code != 0:
        status = "error"
    elif same(r.stdout, expected, mode):
        status = "ok"
    else:
        status = "wrong"
    hidden = bool(t.get("hidden"))
    item = {"index": i, "hidden": hidden, "status": status, "timeMs": r.time_ms}
    reveal_mode = config.HIDDEN_TESTS_REVEAL
    reveal = not hidden or reveal_mode == "always" or (reveal_mode == "failed" and status != "ok")
    if reveal:
        stderr = r.stderr
        if status == "timeout":
            stderr = TIMEOUT_MESSAGE.format(sec=config.TEST_TIMEOUT)
        item.update(
            input=str(t.get("input", "")), expected=expected,
            actual=_clip_head(r.stdout, config.MAX_ACTUAL),
            stderr=_clip_tail(stderr, config.MAX_STDERR),
            error=r.error if status == "error" else None,
        )
    return item
