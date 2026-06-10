# Arcane — PostgreSQL (Prisma / agent state, signals, reputation)
FROM postgres:16-alpine

ENV POSTGRES_USER=arcane \
    POSTGRES_PASSWORD=arcane \
    POSTGRES_DB=arcane

# Optional init scripts (migrations/seeds) go in ./init/
COPY init/ /docker-entrypoint-initdb.d/

EXPOSE 5432
