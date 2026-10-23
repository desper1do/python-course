# План

## Стек
Python 3.12 + FastAPI + uvicorn (WebSocket `/ws/run`), SQLite `/data/app.db`.
React 18 + TS + Vite + Tailwind, CodeMirror 6, xterm.js, react-markdown (+gfm, math, katex, directive),
react-resizable-panels, lucide. Один Dockerfile (node → python-slim), один порт 8080.

## Структура
```
backend/app/{main,db,content,runner,checker,errors}.py   backend/tests/
frontend/src/{pages,components,lib}                       (Vite, собирается в frontend/dist)
content/{curriculum.yaml,lessons/*,_gen/}                 (volume :ro, кэш по mtime)
scripts/verify_content.py   docs/   Dockerfile docker-compose.yml Makefile
```

## API
- `GET /api/curriculum` — блоки, уроки, статусы, карта МЦКО
- `GET /api/lessons/{id}` — lesson.md + задачи (без solution/answer/скрытых тестов)
- `GET /api/teacher/{id}` — teacher.md + решения (только по запросу пульта)
- `GET/PUT /api/code/{key}` — код (key = `task:<id>` | `sandbox:<lesson>`)
- `GET/PUT /api/settings`, `PUT /api/lessons/{id}/done`
- `POST /api/check {taskId, code}`, `POST /api/answer {taskId, values}`, `POST /api/run-predict`
- `GET /api/backup`, `POST /api/restore`
- `WS /ws/run` — run/stdin/stop → stdout/stderr/exit

## БД (все таблицы с `student_id TEXT DEFAULT 'default'`)
- `code(student_id,key,code,updated)`  PK(student_id,key)
- `task_progress(student_id,task_id,status,attempts,solved_at,last_result)`
- `lesson_progress(student_id,lesson_id,manual_done)`
- `settings(student_id,key,value)`
- `attempts_log` не нужен: счётчик в task_progress.
