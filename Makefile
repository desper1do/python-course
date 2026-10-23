up:
	docker compose up --build -d
down:
	docker compose down
logs:
	docker compose logs -f
verify:
	.venv/bin/python scripts/verify_content.py
test:
	.venv/bin/pytest backend/tests
