# VPS Deploy / Bridge Auth Runbook

## 1) Ensure bridge token is configured once

```bash
cd /path/to/editor
cat > .env <<'ENV'
PRESENTONIKA_BRIDGE_TOKEN=strong-secret-token
CONVERTER_URL=http://converter:3001
ADMIN_IMPORT_TOKEN=devtoken
BRIDGE_SAVE_TOKEN_VALIDATE_URL=https://www.presentonika.ru/wp-json/presentonika/v1/validate-save-token
BRIDGE_SAVE_TOKEN_VALIDATE_BEARER=7ukdfXUG83OMCRjSyRyoUNZvI1SmBQgDbWauiq0MB2TItkEd
ENV
```

> `docker-compose.yml` requires `PRESENTONIKA_BRIDGE_TOKEN` and mirrors it to `BRIDGE_TOKEN` for compatibility.
> Для `POST /api/bridge/stage-outzip` в режиме save-fallback обязательно задайте `BRIDGE_SAVE_TOKEN_VALIDATE_URL`, иначе получите `401` (`save-token-validator-misconfigured`).

## 2) Recreate containers after env changes

```bash
docker compose down
docker compose up -d --force-recreate
```

## 3) Verify token is present inside editor container

```bash
docker compose exec editor sh -lc 'env | grep -i "PRESENTONIKA_BRIDGE_TOKEN\|BRIDGE_TOKEN\|BRIDGE_SAVE_TOKEN_VALIDATE"'
```

## 4) Verify bridge auth with Bearer (server-to-server path)

```bash
curl -sv \
  -H "Authorization: Bearer ${PRESENTONIKA_BRIDGE_TOKEN}" \
  http://141.105.68.164/api/bridge/health
```

Expected: `HTTP/1.1 200` and `{"ok":true,"requestId":"..."}`.

## 5) Verify cookie fallback auth (admin/manual path)

```bash
curl -sv \
  --cookie "admin_import=${PRESENTONIKA_BRIDGE_TOKEN}" \
  http://141.105.68.164/api/bridge/health
```

Expected: `HTTP/1.1 200` and `{"ok":true,"requestId":"..."}`.

## 6) Quick diagnostics for 401

```bash
# reproduce unauthorized and capture requestId
curl -s -D - -H "Authorization: Bearer wrong-token" \
  http://141.105.68.164/api/bridge/health

# inspect editor logs
docker compose logs editor --tail=200
```

Look for log records like:
- `[bridge/<scope>] unauthorized`
- `requestId`
- `hasAuthHeader`, `authScheme`, `hasCookie`, `tokenPrefix`, `expectedTokenPrefix`

Use `requestId` from response body to correlate with container logs.

## 7) WordPress token alignment

In WordPress `functions.php`, always use one source:

```php
define('PRESENTONIKA_BRIDGE_TOKEN', 'strong-secret-token');
```

And always send it as:

```http
Authorization: Bearer <PRESENTONIKA_BRIDGE_TOKEN>
```

No browser/public token is required.


## 8) Bridge saveToken server validation (P0.1)

For `POST /api/bridge/stage-outzip` fallback mode, configure a server-side token validation endpoint:

- `BRIDGE_SAVE_TOKEN_VALIDATE_URL` (**required** for save-fallback)
- `BRIDGE_SAVE_TOKEN_VALIDATE_BEARER` (optional but recommended)

Expected response from validation endpoint:

```json
{
  "ok": true,
  "presentationId": "123",
  "userId": "45",
  "expiresAt": "2026-01-01T12:00:00.000Z"
}
```

Quick check from VPS:

```bash
curl -sv -X POST "https://www.presentonika.ru/wp-json/presentonika/v1/validate-save-token" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${BRIDGE_SAVE_TOKEN_VALIDATE_BEARER}" \
  -d '{"presentationId":123,"saveToken":"<saveToken-from-redirectUrl>"}'
```

For a valid token you should receive HTTP `200` with `{"ok":true,...}`.
For an invalid/expired token you should receive either `{"ok":false}` or HTTP `403/401` (both are expected denial paths).

If validation is not successful, bridge fallback auth is denied with `401 UNAUTHORIZED`.

## 9) Nginx hardening

```nginx
client_max_body_size 70m;
limit_req_zone $binary_remote_addr zone=bridge_api:10m rate=15r/m;

location /api/bridge/ {
  limit_req zone=bridge_api burst=20 nodelay;
  proxy_read_timeout 120s;
  proxy_send_timeout 120s;
  proxy_connect_timeout 15s;
}
```
