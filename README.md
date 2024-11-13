# wheel-controller

- Port 4003 is available in Moneypot.dev k8s cluster for wheel-controller.
- Will use 4004 for wheel-experience

Put into `.env`:

```ini
DATABASE_URL=postgres://app_postgraphile:secret@localhost:5432/wheel-controller
SUPERUSER_DATABASE_URL=postgres://localhost:5432/wheel-controller
GRAPHILE_ENV=development
PORT=4003
```
