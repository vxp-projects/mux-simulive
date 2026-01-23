$serverIp = "192.168.96.132"
$port = 5050

$client = New-Object Net.Sockets.TcpClient
$client.Connect($serverIp, $port)
$reader = New-Object System.IO.StreamReader($client.GetStream())
$line = $reader.ReadLine()

if ($line -eq "GO") {
  New-Item -ItemType Directory -Force -Path "perf/reports" | Out-Null
  $env:BASE_URL="https://simulive.cloudysky.xyz"
  $env:STREAM_SLUG="e2e-perf-1769037714892"
  $env:CONNECTIONS="5000"
  $env:RAMP_UP="5m"
  $env:HOLD="10m"
  $env:LOG_INTERVAL="60s"
  node perf/sse-load.js | Tee-Object -FilePath perf/reports/sse-only-5000-client.log
}
