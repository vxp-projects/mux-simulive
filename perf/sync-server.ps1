$port = 5050
$listener = [System.Net.Sockets.TcpListener]::new([Net.IPAddress]::Any, $port)
$listener.Start()
Write-Host "Waiting for client on port $port..."
$client = $listener.AcceptTcpClient()
Write-Host "Client connected. Press Enter to start both tests."
[void][Console]::ReadLine()

$writer = New-Object System.IO.StreamWriter($client.GetStream())
$writer.AutoFlush = $true
$writer.WriteLine("GO")

$client.Close()
$listener.Stop()

$env:BASE_URL="https://simulive.cloudysky.xyz"
$env:STREAM_SLUG="e2e-perf-1769037714892"
$env:CONNECTIONS="5000"
$env:RAMP_UP="5m"
$env:HOLD="10m"
$env:LOG_INTERVAL="60s"
node perf/sse-load.js | Tee-Object -FilePath perf/reports/sse-only-5000-coordinator.log
