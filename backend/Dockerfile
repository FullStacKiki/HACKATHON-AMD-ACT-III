# Backend image. Build context is the repository root (see docker-compose.yml): the package is imported as `backend`.
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# The keys are NOT in the image: backend/.env is excluded by .dockerignore and compose passes the variables at run time.
COPY backend backend

EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
