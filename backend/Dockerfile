FROM node:22-slim AS frontend-build

WORKDIR /frontend

COPY package.json package-lock.json ./
RUN npm ci

COPY vite.config.js ./
COPY public ./public
COPY src ./src

RUN npm run build

FROM python:3.13-slim

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY --from=frontend-build /frontend/dist ./frontend-dist

ENV NEURODIARY_DATABASE_PATH=/data/neurodiary-sync.db
ENV NEURODIARY_FRONTEND_DIST=/app/frontend-dist
ENV PORT=8080

EXPOSE 8080

CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
