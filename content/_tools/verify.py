#!/usr/bin/env python3
"""Автономная проверка контента: схема, прогон solution по тестам, сверка с output.

Запуск:  python3 content/_tools/verify.py [id-урока ...]
Нужен PyYAML. Код возврата 1, если есть хотя бы одна ошибка.
"""
import ast
import os
import re
import subprocess
import sys
import tempfile

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TIMEOUT = 3
SEEN_IDS: set[str] = set()
errors: list[str] = []
warnings: list[str] = []


def err(where, msg):
    errors.append(f"{where}: {msg}")


def warn(where, msg):
    warnings.append(f"{where}: {msg}")


def load_yaml(path):
    try:
        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f)
    except Exception as e:  # noqa: BLE001
        err(path, f"не читается YAML: {e}")
        return None


def run_code(code, stdin):
    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(d, "main.py"), "w", encoding="utf-8") as f:
            f.write(code)
        try:
            p = subprocess.run(
                [sys.executable, "-u", "-B", "main.py"], cwd=d, input=stdin,
                capture_output=True, text=True, timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            return None, "timeout"
        return p.stdout, p.stderr if p.returncode else ""


def norm_exact(s):
    return "\n".join(line.rstrip() for line in s.rstrip().split("\n"))


def same(checker, got, want):
    if checker == "exact":
        return norm_exact(got) == norm_exact(want)
    if checker == "tokens":
        return got.split() == want.split()
    if checker == "float":
        a, b = got.split(), want.split()
        if len(a) != len(b):
            return False
        try:
            return all(abs(float(x) - float(y)) <= 1e-6 for x, y in zip(a, b))
        except ValueError:
            return False
    return False


def imports_of(code):
    res = set()
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return res
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            res |= {a.name.split(".")[0] for a in n.names}
        elif isinstance(n, ast.ImportFrom) and n.module:
            res.add(n.module.split(".")[0])
    return res


def input_prompts(code):
    """input("текст") с непустым аргументом."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return False
    for n in ast.walk(tree):
        if (isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
                and n.func.id == "input" and n.args):
            return True
    return False


# с какого урока можно использовать конструкцию (словарь курса, раздел 10 ТЗ)
NODE_FROM = {"If": 4, "BoolOp": 5, "While": 7, "For": 8, "Subscript": 9, "List": 12,
             "ListComp": 12, "Dict": 12, "Set": 12, "FunctionDef": 13, "Return": 13,
             "With": 19, "Lambda": 99, "GeneratorExp": 12, "Tuple": 12, "Slice": 9,
             "AugAssign": 7, "Try": 99, "Break": 7, "Continue": 7}
NAME_FROM = {"max": 3, "range": 8, "sum": 10, "min": 10, "abs": 10, "sorted": 12,
             "list": 12, "set": 12, "bin": 14, "enumerate": 17, "open": 19,
             "round": 99, "float": 1, "print": 1, "input": 1, "int": 1, "str": 3,
             "len": 3, "reversed": 12, "zip": 99, "map": 99, "chr": 99, "ord": 99}
ATTR_FROM = {"count": 9, "find": 9, "upper": 9, "lower": 9, "append": 12, "split": 12,
             "join": 12, "read": 19, "index": 12, "add": 12, "sort": 12,
             "strip": 9, "replace": 9, "startswith": 9, "endswith": 9, "isdigit": 9,
             "format": 99}
# разрешённые «дополнительные» имена/атрибуты по урокам вводятся здесь же
EXTRA_NAME = {}


def vocab_errors(code, lesson_no):
    out = set()
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return {f"SyntaxError: {e}"}
    imported = imports_of(code)
    for n in ast.walk(tree):
        k = type(n).__name__
        if k == "Tuple" and isinstance(getattr(n, "ctx", None), ast.Store):
            k = "Tuple"
        if k in NODE_FROM and NODE_FROM[k] > lesson_no:
            out.add(f"конструкция {k} с урока {NODE_FROM[k]}")
        if isinstance(n, ast.Name) and n.id in NAME_FROM and NAME_FROM[n.id] > lesson_no:
            out.add(f"{n.id}() с урока {NAME_FROM[n.id]}")
        if isinstance(n, ast.Attribute) and n.attr in ATTR_FROM and ATTR_FROM[n.attr] > lesson_no:
            if not (isinstance(n.value, ast.Name) and n.value.id in imported):
                out.add(f".{n.attr}() с урока {ATTR_FROM[n.attr]}")
    return out


REQ = ["id", "type", "title", "level", "required", "mcko", "statement",
       "input_format", "output_format", "starter", "examples", "tests",
       "checker", "hints", "solution", "explanation"]


def check_task(lid, t, idx, allowed, seen_ids, stats):
    lesson_no = int(lid[:2])
    where = f"{lid}/tasks.yaml[{idx}]"
    if not isinstance(t, dict):
        return err(where, "задача не словарь")
    tid = t.get("id", "?")
    where = f"{lid}:{tid}"
    for k in REQ:
        if k not in t:
            err(where, f"нет поля {k}")
    if tid in seen_ids:
        err(where, "дублирующийся id")
    seen_ids.add(tid)
    if t.get("type") != "code":
        err(where, "type должен быть code")
        return
    if t.get("level") not in (1, 2, 3, 4):
        err(where, "level 1..4")
    if t.get("checker") not in ("exact", "tokens", "float"):
        err(where, "checker: exact|tokens|float")
    if not isinstance(t.get("mcko", []), list):
        err(where, "mcko должен быть списком")
    if t.get("level") == 4 and t.get("required"):
        err(where, "звёздочка должна быть required: false")
    hints = t.get("hints") or []
    if len(hints) < 2:
        err(where, "нужно ≥2 hints")
    exs = t.get("examples") or []
    tests = t.get("tests") or []
    if len(tests) < 5:
        err(where, f"тестов {len(tests)} < 5")
    if len(exs) < 1:
        err(where, "нет examples")
    for i, e in enumerate(exs):
        if i < len(tests) and (
                str(tests[i].get("input", "")) != str(e.get("input", ""))
                or str(tests[i].get("output", "")) != str(e.get("output", ""))):
            err(where, f"тест {i + 1} не совпадает с примером {i + 1}")
        if i < len(tests) and tests[i].get("hidden"):
            err(where, f"тест {i + 1} (пример) не должен быть hidden")
    for i, tc in enumerate(tests):
        if i >= len(exs) and not tc.get("hidden"):
            err(where, f"тест {i + 1} должен быть hidden: true")
        if "input" not in tc or "output" not in tc:
            err(where, f"тест {i + 1}: нет input/output")
    sol = t.get("solution") or ""
    for m in imports_of(sol) - allowed:
        err(where, f"solution импортирует {m}, не разрешено")
    for m in imports_of(t.get("starter") or "") - allowed:
        err(where, f"starter импортирует {m}, не разрешено")
    for field in ("solution", "starter"):
        for v in vocab_errors(t.get(field) or "", lesson_no):
            err(where, f"{field}: {v}")
        if input_prompts(t.get(field) or ""):
            err(where, f"{field}: подсказка в input() запрещена")
    if re.search(r"^:::|\$\$", t.get("statement") or "", re.M):
        err(where, "в условии директивы :::/формулы KaTeX не используются")
    # прогон
    stats["tasks"] += 1
    for i, tc in enumerate(tests):
        stdin = str(tc.get("input", ""))
        if stdin and not stdin.endswith("\n"):
            stdin += "\n"
        out, e = run_code(sol, stdin)
        if out is None:
            err(where, f"тест {i + 1}: таймаут")
        elif e:
            err(where, f"тест {i + 1}: solution упал: {e.strip().splitlines()[-1]}")
        elif not same(t.get("checker"), out, str(tc.get("output", ""))):
            err(where, f"тест {i + 1}: ждали {tc.get('output')!r}, получили {out!r}")


def theory_words(md):
    md = re.sub(r"^---.*?---", "", md, flags=re.S)
    md = re.sub(r"```.*?```", "", md, flags=re.S)
    md = re.sub(r"<[^>]+>", " ", md)
    return len(re.findall(r"\w+", md))


def check_lesson(lesson, allowed, stats):
    lid = lesson["id"]
    d = os.path.join(ROOT, "lessons", lid)
    for f in ("lesson.md", "tasks.yaml", "teacher.md"):
        if not os.path.isfile(os.path.join(d, f)):
            err(lid, f"нет файла {f}")
    if errors and not os.path.isfile(os.path.join(d, "tasks.yaml")):
        return
    lm = os.path.join(d, "lesson.md")
    if os.path.isfile(lm):
        md = open(lm, encoding="utf-8").read()
        fm = re.match(r"^---\n(.*?)\n---\n", md, re.S)
        if not fm:
            err(lid, "lesson.md: нет front matter")
        else:
            meta = yaml.safe_load(fm.group(1)) or {}
            for k in ("title", "subtitle", "goal"):
                if k not in meta:
                    err(lid, f"lesson.md: нет {k} во front matter")
        if re.search(r"^:::", md, re.M) or "$$" in md:
            err(lid, "lesson.md: директивы :::/KaTeX пока не поддерживаются")
        w = theory_words(md)
        stats["words"] = w
        if w > 500:
            warn(lid, f"теории {w} слов (> 500)")
        if md.count("```python") < 3:
            warn(lid, "меньше 3 запускаемых примеров")
        if "<details>" not in md:
            warn(lid, "нет <details> (предсказание «что выведет?»)")
        for code in re.findall(r"```python\n(.*?)```", md, re.S):
            for m in imports_of(code) - allowed:
                err(lid, f"lesson.md: import {m} не разрешён")
            if input_prompts(code):
                warn(lid, "lesson.md: input() с подсказкой в примере")
            for v in vocab_errors(code, int(lid[:2])):
                err(lid, f"lesson.md: {v}")
    tasks = load_yaml(os.path.join(d, "tasks.yaml")) or []
    if not isinstance(tasks, list):
        return err(lid, "tasks.yaml должен быть списком")
    for i, t in enumerate(tasks):
        check_task(lid, t, i, allowed, SEEN_IDS, stats)
    n = len(tasks)
    top = 13 if int(lid[:2]) >= 21 else 12 if int(lid[:2]) >= 16 else 10
    if not 7 <= n <= top:
        warn(lid, f"задач {n} (нужно 7–{top})")
    levels = [t.get("level") for t in tasks if isinstance(t, dict)]
    if levels != sorted(levels):
        warn(lid, "level должен идти по нарастанию")
    stats["n"] = n


def main():
    cur = load_yaml(os.path.join(ROOT, "curriculum.yaml"))
    if not cur:
        err("curriculum.yaml", "пуст или не читается")
    else:
        blocks = {b["id"] for b in cur.get("blocks", [])}
        only = set(sys.argv[1:])
        allowed: set[str] = set()
        ids = set()
        all_task_ids: set[str] = set()
        for ls in cur.get("lessons", []):
            for k in ("id", "block", "title", "minutes", "mcko", "allowed_imports"):
                if k not in ls:
                    err(ls.get("id", "?"), f"curriculum: нет {k}")
            if ls["id"] in ids:
                err(ls["id"], "дубль урока")
            ids.add(ls["id"])
            if ls.get("block") not in blocks:
                err(ls["id"], "неизвестный block")
            allowed |= set(ls.get("allowed_imports") or [])
            if only and ls["id"] not in only:
                continue
            if not os.path.isdir(os.path.join(ROOT, "lessons", ls["id"])):
                err(ls["id"], "нет папки урока")
                continue
            stats = {"tasks": 0, "words": 0, "n": 0}
            check_lesson(ls, set(allowed), stats)
            print(f"  {ls['id']}: теория {stats['words']} слов, задач {stats['n']}")
        for name in os.listdir(os.path.join(ROOT, "lessons")):
            if name not in ids:
                warn(name, "папка урока не указана в curriculum.yaml")
    for w in warnings:
        print("ПРЕДУПРЕЖДЕНИЕ:", w)
    for e in errors:
        print("ОШИБКА:", e)
    if errors:
        print(f"\nКРАСНЫЙ: ошибок {len(errors)}")
        sys.exit(1)
    print("\nЗЕЛЁНЫЙ: всё проверено")


if __name__ == "__main__":
    main()
