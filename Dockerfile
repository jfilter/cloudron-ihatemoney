# IHateMoney for Cloudron
#
# Built on cloudron/base (the supported, predictable runtime: read-only rootfs,
# unprivileged "cloudron" user, gosu, mysql client). ihatemoney is installed
# from PyPI into a venv so updates are a one-line version bump + rebuild.
#
# Latest base image as of 2026-06 (Ubuntu, batteries-included: python3, gosu,
# the unprivileged "cloudron" user). Check https://hub.docker.com/r/cloudron/base
# for newer tags; optionally pin by @sha256 digest for reproducibility.
FROM cloudron/base:5.0.0

# The ihatemoney version to install. Bump this (and the CloudronManifest
# version) per release; the app auto-migrates its schema on start. To migrate
# data from an existing instance, build that instance's version first, import
# the dump, then bump.
ARG IHATEMONEY_VERSION=7.1.1

# python3-venv for the isolated install; mariadb-client to import a DB dump via
# `cloudron exec` and to debug the database.
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3-venv mariadb-client && \
    rm -rf /var/lib/apt/lists/*

# ihatemoney[database] pulls PyMySQL (MySQL/MariaDB) + psycopg2-binary.
# cryptography lets PyMySQL authenticate against MySQL 8's default
# caching_sha2_password (the Cloudron mysql addon is MySQL 8.0).
RUN mkdir -p /app/code && \
    python3 -m venv /app/code/venv && \
    /app/code/venv/bin/pip install --no-cache-dir --upgrade pip && \
    /app/code/venv/bin/pip install --no-cache-dir \
        "ihatemoney[database]==${IHATEMONEY_VERSION}" gunicorn cryptography

# Work around an upstream connection leak: ihatemoney's _pre_alembic_db() calls
# db.engine.connect() without ever closing it, so on MySQL 8 the lingering
# transaction holds metadata locks and Alembic's first CREATE TABLE deadlocks
# (lock_wait_timeout ~= forever) on a fresh database. Close it via a context
# manager. (SQLite/MariaDB don't surface this; MySQL 8 does. Worth upstreaming.)
RUN /app/code/venv/bin/python3 <<'PY'
import ihatemoney.run as m
f = m.__file__
s = open(f).read()
old = (
    '        con = db.engine.connect()\n'
    '        tables_exist = db.engine.dialect.has_table(con, "project")\n'
    '        alembic_setup = db.engine.dialect.has_table(con, "alembic_version")\n'
    '        return tables_exist and not alembic_setup\n'
)
new = (
    '        with db.engine.connect() as con:\n'
    '            tables_exist = db.engine.dialect.has_table(con, "project")\n'
    '            alembic_setup = db.engine.dialect.has_table(con, "alembic_version")\n'
    '            return tables_exist and not alembic_setup\n'
)
assert old in s, "patch target not found in " + f
open(f, "w").write(s.replace(old, new))
print("patched _pre_alembic_db ->", f)
PY

COPY start.sh /app/code/start.sh
RUN chmod +x /app/code/start.sh

CMD [ "/app/code/start.sh" ]
