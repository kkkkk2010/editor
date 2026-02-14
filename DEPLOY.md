# VPS Deploy / Bridge Auth Runbook

## 1) Ensure bridge token is configured once

```bash
cd /path/to/editor
cat > .env <<'ENV'
PRESENTONIKA_BRIDGE_TOKEN=strong-secret-token
CONVERTER_URL=http://converter:3001
ADMIN_IMPORT_TOKEN=devtoken
ENV
```

> `docker-compose.yml` requires `PRESENTONIKA_BRIDGE_TOKEN` and mirrors it to `BRIDGE_TOKEN` for compatibility.

## 2) Recreate containers after env changes

```bash
docker compose down
docker compose up -d --force-recreate
```

## 3) Verify token is present inside editor container

```bash
docker compose exec editor sh -lc 'env | grep -i "PRESENTONIKA_BRIDGE_TOKEN\|BRIDGE_TOKEN"'
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
