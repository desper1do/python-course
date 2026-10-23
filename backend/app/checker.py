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


async def run_tests(runner, code, task, files):
    results = []
    for i, t in enumerate(task.get("tests", [])):
        r = await runner.run_batch(code, files, str(t.get("input", "")), 3.0)
        if r.reason == "timeout":
            status = "timeout"
        elif r.code != 0:
            status = "error"
        elif same(r.stdout, str(t["output"]), task.get("checker", "exact")):
            status = "ok"
        else:
            status = "wrong"
        item = {"index": i, "status": status, "hidden": bool(t.get("hidden"))}
        if not item["hidden"]:
            item.update(input=str(t.get("input", "")), expected=str(t["output"]), actual=r.stdout,
                        error=(r.error or {}).get("type") if status == "error" else None)
        results.append(item)
    return results
