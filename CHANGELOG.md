[1.0.0]
* Cloudron package for IHateMoney (upstream 7.1.1)
* MySQL + sendmail + localstorage addons; automatic schema migration on start
* PyMySQL + cryptography for MySQL 8 (caching_sha2_password) auth
* Per-instance config overrides via /app/data/overrides.cfg
* Fix fresh-DB migration deadlock on MySQL 8 (close leaked connection in _pre_alembic_db)
* End-to-end tests: local docker-compose + Cloudron lifecycle, with CI
