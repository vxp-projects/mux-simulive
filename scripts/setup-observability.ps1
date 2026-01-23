param(
  [Parameter(Mandatory = $true)]
  [string]$ServerIp,
  [Parameter(Mandatory = $true)]
  [string]$NginxConfPath,
  [string]$ServerUser = "root",
  [string]$NginxContainerName = "simulive-nginx"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (!(Test-Path $NginxConfPath)) {
  throw "nginx.conf not found at: $NginxConfPath"
}

if (!(Get-Command ssh -ErrorAction SilentlyContinue)) {
  throw "ssh not found. Install OpenSSH client on this machine."
}

if (!(Get-Command scp -ErrorAction SilentlyContinue)) {
  throw "scp not found. Install OpenSSH client on this machine."
}

$sshOpts = @(
  "-o", "StrictHostKeyChecking=accept-new"
)

$remoteLines = @(
  'set -euo pipefail',
  'OBS_ROOT="/mnt/user/appdata/observability"',
  'NGINX_ROOT="/mnt/user/appdata/simulive/nginx"',
  'NGINX_CONTAINER="__NGINX_CONTAINER__"',
  '',
  'mkdir -p "${OBS_ROOT}/"{grafana,loki,promtail} "${NGINX_ROOT}/logs"',
  '',
  '# Force access_log to stdout + error_log to stderr',
  'sed -i ''s|access_log .*;|access_log /dev/stdout main;|'' "${NGINX_ROOT}/nginx.conf"',
  'sed -i ''s|error_log .*;|error_log /dev/stderr warn;|'' "${NGINX_ROOT}/nginx.conf"',
  '',
  '# Promtail config (Docker logs)',
  'cat <<''YAML'' > "${OBS_ROOT}/promtail/promtail.yaml"',
  'server:',
  '  http_listen_port: 9080',
  '',
  'positions:',
  '  filename: /var/lib/promtail/positions.yaml',
  '',
  'clients:',
  '  - url: http://loki:3100/loki/api/v1/push',
  '',
  'scrape_configs:',
  '  - job_name: nginx',
  '    docker_sd_configs:',
  '      - host: unix:///var/run/docker.sock',
  '        refresh_interval: 5s',
  '    relabel_configs:',
  '      - source_labels: [__meta_docker_container_name]',
  '        regex: /__NGINX_CONTAINER__.*',
  '        action: keep',
  '      - target_label: job',
  '        replacement: nginx',
  '      - source_labels: [__meta_docker_container_name]',
  '        target_label: container',
  '    pipeline_stages:',
  '      - docker: {}',
  '      - static_labels:',
  '          job: nginx',
  'YAML',
  '',
  'mkdir -p "${OBS_ROOT}/promtail"',
  '',
  '# Loki config (allow initial backfill without 400s)',
  'cat <<''YAML'' > "${OBS_ROOT}/loki/loki-config.yaml"',
  'auth_enabled: false',
  '',
  'server:',
  '  http_listen_port: 3100',
  '',
  'common:',
  '  path_prefix: /loki',
  '  storage:',
  '    filesystem:',
  '      chunks_directory: /loki/chunks',
  '      rules_directory: /loki/rules',
  '  replication_factor: 1',
  '  ring:',
  '    kvstore:',
  '      store: inmemory',
  '',
  'schema_config:',
  '  configs:',
  '    - from: 2024-01-01',
  '      store: boltdb-shipper',
  '      object_store: filesystem',
  '      schema: v13',
  '      index:',
  '        prefix: index_',
  '        period: 24h',
  '',
  'storage_config:',
  '  boltdb_shipper:',
  '    active_index_directory: /loki/index',
  '    cache_location: /loki/boltdb-cache',
  '    shared_store: filesystem',
  '  filesystem:',
  '    directory: /loki/chunks',
  '',
  'limits_config:',
  '  reject_old_samples: false',
  '  reject_old_samples_max_age: 168h',
  '  ingestion_rate_mb: 20',
  '  ingestion_burst_size_mb: 40',
  'YAML',
  '',
  'chmod 644 "${OBS_ROOT}/loki/loki-config.yaml"',
  'chmod 644 "${OBS_ROOT}/promtail/promtail.yaml"',
  '',
  '# Observability stack',
  'cat <<''YAML'' > "${OBS_ROOT}/docker-compose.yml"',
  'services:',
  '  loki:',
  '    image: grafana/loki:2.9.3',
  '    command: -config.file=/loki/loki-config.yaml',
  '    ports:',
  '      - "3100:3100"',
  '    volumes:',
  '      - /mnt/user/appdata/observability/loki:/loki',
  '',
  '  promtail:',
  '    image: grafana/promtail:2.9.3',
  '    volumes:',
  '      - /var/run/docker.sock:/var/run/docker.sock:ro',
  '      - /mnt/user/appdata/observability/promtail/promtail.yaml:/etc/promtail/config.yml:ro',
  '      - /mnt/user/appdata/observability/promtail:/var/lib/promtail',
  '    command: -config.file=/etc/promtail/config.yml',
  '    depends_on:',
  '      - loki',
  '',
  '  grafana:',
  '    image: grafana/grafana:10.4.2',
  '    ports:',
  '      - "3001:3000"',
  '    volumes:',
  '      - /mnt/user/appdata/observability/grafana:/var/lib/grafana',
  '    depends_on:',
  '      - loki',
  'YAML',
  '',
  '# Push nginx.conf into container and restart',
  'if docker ps -a --format "{{.Names}}" | grep -qx "${NGINX_CONTAINER}"; then',
  '  MOUNT_SOURCE=$(docker inspect --format ''{{range .Mounts}}{{if eq .Destination "/etc/nginx/nginx.conf"}}{{.Source}}{{end}}{{end}}'' "${NGINX_CONTAINER}")',
  '  if [ -n "${MOUNT_SOURCE}" ]; then',
  '    cp "${NGINX_ROOT}/nginx.conf" "${MOUNT_SOURCE}"',
  '  else',
  '    cat "${NGINX_ROOT}/nginx.conf" | docker exec -i "${NGINX_CONTAINER}" sh -c ''cat > /etc/nginx/nginx.conf''',
  '  fi',
  '  docker restart "${NGINX_CONTAINER}" || true',
  'else',
  '  echo "nginx container not found; update container name or create it before rerunning."',
  'fi',
  '',
  '# Start observability stack',
  'if docker compose version >/dev/null 2>&1; then',
  '  COMPOSE=(docker compose)',
  'elif docker-compose version >/dev/null 2>&1; then',
  '  COMPOSE=(docker-compose)',
  'else',
  '  echo "Docker Compose not found. Install Compose or the Unraid Compose plugin."',
  '  exit 1',
  'fi',
  '',
  '"${COMPOSE[@]}" -f "${OBS_ROOT}/docker-compose.yml" down --remove-orphans || true',
  '"${COMPOSE[@]}" -f "${OBS_ROOT}/docker-compose.yml" up -d --force-recreate',
  '',
  '# Sanity check: ensure Loki sees the config we wrote',
  '"${COMPOSE[@]}" -f "${OBS_ROOT}/docker-compose.yml" exec -T loki sh -c ''grep -q "reject_old_samples: false" /loki/loki-config.yaml''',
  '',
  'echo "Done. Grafana: http://<unraid-ip>:3001"'
)

$remoteSetup = ($remoteLines -join "`n") -replace '__NGINX_CONTAINER__', $NginxContainerName

Write-Host "Copying nginx.conf to $ServerUser@$ServerIp..."
ssh @sshOpts "${ServerUser}@${ServerIp}" "mkdir -p /mnt/user/appdata/simulive/nginx"
scp @sshOpts $NginxConfPath "${ServerUser}@${ServerIp}:/mnt/user/appdata/simulive/nginx/nginx.conf"

Write-Host "Running remote setup on $ServerUser@$ServerIp..."
$remoteSetup | ssh @sshOpts "${ServerUser}@${ServerIp}" "bash -s"

Write-Host "All done. Grafana should be at http://$ServerIp:3001" -ForegroundColor Green
