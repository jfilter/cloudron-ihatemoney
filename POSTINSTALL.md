Thanks for installing **I Hate Money**!

A few notes:

* The database (MySQL) and outbound mail are wired automatically via Cloudron addons.
* Schema migrations run automatically on every start — updates are seamless.
* The **admin dashboard** is enabled only once you place a password hash at
  `/app/data/admin_password_hash`. Generate one with:
  `cloudron exec --app <location> -- /app/code/venv/bin/ihatemoney generate_password_hash`
  then write it into that file and restart. See the README for details.
