#!/bin/bash
set -eu

# ---------------------------------------------------------------------------
# Cloudron start script for IHateMoney
#
# On Cloudron the container's root filesystem is READ-ONLY. Only /app/data
# (persisted + backed up via the "localstorage" addon), /tmp and /run are
# writable. We therefore render the runtime config into /app/data instead of
# the image's default /etc/ihatemoney location.
# ---------------------------------------------------------------------------

DATA_DIR=/app/data
CONFIG_FILE="${DATA_DIR}/ihatemoney.cfg"
SECRET_FILE="${DATA_DIR}/secret_key"

mkdir -p "${DATA_DIR}"

# --- Stable SECRET_KEY -----------------------------------------------------
# Must stay constant across restarts/updates. If it changes, all sessions are
# invalidated and outstanding invite/reset links break (project passwords in
# the DB keep working, so users can simply log in again). Generate once, then
# persist in the backed-up data dir.
if [[ ! -s "${SECRET_FILE}" ]]; then
    echo "[ihatemoney] generating a new SECRET_KEY"
    head -c 48 /dev/urandom | base64 | tr -d '\n=' > "${SECRET_FILE}"
fi
SECRET_KEY="$(cat "${SECRET_FILE}")"

# --- Admin dashboard -------------------------------------------------------
# The admin password hash is read from a file in the backed-up data dir so it
# never lands in the image, git or logs. Drop a hash there, or generate a fresh
# one (see README). The dashboard activates only once the file is present.
ADMIN_PW_FILE="${DATA_DIR}/admin_password_hash"
ACTIVATE_ADMIN_DASHBOARD="False"
if [[ -s "${ADMIN_PW_FILE}" ]]; then
    ACTIVATE_ADMIN_DASHBOARD="True"
fi

# --- Database (Cloudron mysql addon) ---------------------------------------
# Force the pymysql driver: a bare mysql:// URI makes SQLAlchemy look for
# mysqlclient (not installed); mysql+pymysql:// uses the bundled PyMySQL.
DB_URI="mysql+pymysql://${CLOUDRON_MYSQL_USERNAME}:${CLOUDRON_MYSQL_PASSWORD}@${CLOUDRON_MYSQL_HOST}:${CLOUDRON_MYSQL_PORT}/${CLOUDRON_MYSQL_DATABASE}?charset=utf8mb4"

# --- Render config ---------------------------------------------------------
cat > "${CONFIG_FILE}" <<EOF
SECRET_KEY = "${SECRET_KEY}"
SQLALCHEMY_DATABASE_URI = "${DB_URI}"
SQLALCHEMY_TRACK_MODIFICATIONS = False
SESSION_COOKIE_SECURE = True
DEBUG = False

# Behaviour defaults — adjust to taste.
ACTIVATE_DEMO_PROJECT = False
ALLOW_PUBLIC_PROJECT_CREATION = False
SHOW_ADMIN_EMAIL = True
ACTIVATE_ADMIN_DASHBOARD = ${ACTIVATE_ADMIN_DASHBOARD}

# --- Outbound mail via the Cloudron sendmail addon ---
# Cloudron's internal relay listens without TLS/STARTTLS on CLOUDRON_MAIL_SMTP_PORT.
MAIL_SERVER = "${CLOUDRON_MAIL_SMTP_SERVER}"
MAIL_PORT = ${CLOUDRON_MAIL_SMTP_PORT}
MAIL_USERNAME = "${CLOUDRON_MAIL_SMTP_USERNAME}"
MAIL_PASSWORD = "${CLOUDRON_MAIL_SMTP_PASSWORD}"
MAIL_USE_TLS = False
MAIL_USE_SSL = False
MAIL_DEFAULT_SENDER = "${CLOUDRON_MAIL_FROM}"
EOF

# Append the admin password hash separately (kept out of the rendered heredoc
# and any transcript). Only present when you've placed the hash file.
if [[ -s "${ADMIN_PW_FILE}" ]]; then
    printf 'ADMIN_PASSWORD = "%s"\n' "$(cat "${ADMIN_PW_FILE}")" >> "${CONFIG_FILE}"
fi

# Optional per-instance overrides: any valid config lines in this file are
# appended last (so they win). Lets you tweak behaviour without rebuilding — and
# is how the e2e test flips ALLOW_PUBLIC_PROJECT_CREATION on.
if [[ -s "${DATA_DIR}/overrides.cfg" ]]; then
    cat "${DATA_DIR}/overrides.cfg" >> "${CONFIG_FILE}"
fi

export IHATEMONEY_SETTINGS_FILE_PATH="${CONFIG_FILE}"

# Ownership is not preserved across restarts on Cloudron — (re)assert it so the
# unprivileged "cloudron" user can read the config and write the SQLite-less data.
chown -R cloudron:cloudron "${DATA_DIR}"

# --- Migrate once, up front -------------------------------------------------
# ihatemoney auto-migrates inside create_app(). Trigger it once in a standalone
# process so the schema is current BEFORE gunicorn forks its workers — otherwise
# the workers race on the first migration and deadlock on a MySQL metadata lock.
# Do NOT use `ihatemoney db upgrade` here: that runs create_app() (which already
# migrates) AND a second migration in the same process, which self-deadlocks on
# MySQL (two connections both trying to create alembic_version).
echo "[ihatemoney] applying database migrations"
/usr/local/bin/gosu cloudron:cloudron /app/code/venv/bin/python -c "import ihatemoney.wsgi"

# --- Serve -----------------------------------------------------------------
echo "[ihatemoney] starting gunicorn on :8000"
exec /usr/local/bin/gosu cloudron:cloudron /app/code/venv/bin/gunicorn \
    --workers 2 \
    --bind 0.0.0.0:8000 \
    --access-logfile - \
    --error-logfile - \
    ihatemoney.wsgi:application
