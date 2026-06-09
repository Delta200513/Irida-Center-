# Deployment Templates

These files help you perform the first VPS deployment without inventing the server config from scratch.

## Files

- `systemd/irida-backend.service`
  - systemd unit for the FastAPI backend
- `nginx/irida-center-ip.conf`
  - initial Nginx config for launch by server IP without a domain

## Expected server layout

```text
/var/www/irida-center/
  frontend/
  backend/
    .env
    .venv/
    app/
    uploads/
```

## Backend service

1. Copy `systemd/irida-backend.service` to:
   - `/etc/systemd/system/irida-backend.service`
2. Run:
   - `systemctl daemon-reload`
   - `systemctl enable irida-backend`
   - `systemctl start irida-backend`
   - `systemctl status irida-backend`

## Nginx for first launch by IP

1. Copy `nginx/irida-center-ip.conf` to:
   - `/etc/nginx/sites-available/irida-center`
2. Enable it:
   - `ln -s /etc/nginx/sites-available/irida-center /etc/nginx/sites-enabled/irida-center`
3. Remove default config if needed:
   - `rm -f /etc/nginx/sites-enabled/default`
4. Check and reload:
   - `nginx -t`
   - `systemctl reload nginx`

## When a real domain appears

After moving from IP to a domain:

- update `CORS_ORIGINS` in `.env`
- update `YANDEX_OAUTH_REDIRECT_URI` in `.env`
- replace the Nginx `server_name`
- add HTTPS
