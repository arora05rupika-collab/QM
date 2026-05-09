FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY MigrateAI/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the AI model into the image so first request isn't slow
RUN python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

COPY MigrateAI/ .

EXPOSE 8000

CMD ["python3", "main.py"]
