# ==========================================================
# iReader POS — iPad Development Launcher Script
# ==========================================================

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Iniciando Entorno de Desarrollo para iReader iPad POS  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Base de Datos PostgreSQL
Write-Host "[1/4] Verificando Base de Datos PostgreSQL..." -ForegroundColor Yellow
$pgPort = Get-NetTCPConnection -LocalPort 5432 -ErrorAction SilentlyContinue
if (-not $pgPort) {
    Write-Host "Iniciando contenedor PostgreSQL (icellshop_postgres_local)..." -ForegroundColor Yellow
    docker compose -f docker-compose.db.yml up -d
    Start-Sleep -Seconds 2
} else {
    Write-Host "-> PostgreSQL activo y escuchando en puerto 5432." -ForegroundColor Green
}

# 2. Deteccion de IP Local Wi-Fi / LAN
$localIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    $_.IPAddress -notlike "127.*" -and 
    $_.IPAddress -notlike "172.*" -and 
    $_.IPAddress -notlike "169.254.*" -and 
    $_.InterfaceAlias -match "Wi-Fi|Ethernet" 
} | Sort-Object -Property @{ Expression = { if ($_.IPAddress -like "192.168.*") { 0 } else { 1 } } } | Select-Object -ExpandProperty IPAddress -First 1)

if (-not $localIp) {
    $localIp = "192.168.100.73"
}

# 3. Backend Next.js (0.0.0.0:3007)
Write-Host "[2/4] Verificando Backend Next.js..." -ForegroundColor Yellow
$backendPort = Get-NetTCPConnection -LocalPort 3007 -ErrorAction SilentlyContinue
if (-not $backendPort) {
    Write-Host "Iniciando Next.js en segundo plano (0.0.0.0:3007)..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Servidor Next.js (0.0.0.0:3007)' -ForegroundColor Green; npx next dev -H 0.0.0.0 -p 3007" -WindowStyle Minimized
    
    # Esperar a que el puerto 3007 este listo
    $attempts = 0
    while ($attempts -lt 15) {
        Start-Sleep -Seconds 1
        $ready = Get-NetTCPConnection -LocalPort 3007 -ErrorAction SilentlyContinue
        if ($ready) { break }
        $attempts++
    }
    Write-Host "-> Backend Next.js iniciado exitosamente en puerto 3007." -ForegroundColor Green
} else {
    Write-Host "-> Backend Next.js ya esta activo en puerto 3007." -ForegroundColor Green
}

# 4. Tunel HTTPS ngrok
Write-Host "[3/4] Verificando tunel ngrok HTTPS..." -ForegroundColor Yellow
$ngrokUrl = $null
try {
    $tunnel = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -ErrorAction Stop
    $targetAddr = $tunnel.tunnels[0].config.addr
    if ($targetAddr -match "3007") {
        $ngrokUrl = $tunnel.tunnels[0].public_url
    } else {
        Get-Process -Name ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
        throw "Puerto ngrok apunta a $targetAddr en vez de 3007"
    }
} catch {
    Write-Host "Iniciando ngrok http 3007 en segundo plano..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Tunel ngrok http 3007' -ForegroundColor Green; npx ngrok http 3007" -WindowStyle Minimized
    
    $attempts = 0
    while ($attempts -lt 10) {
        Start-Sleep -Seconds 1
        try {
            $tunnel = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -ErrorAction Stop
            $ngrokUrl = $tunnel.tunnels[0].public_url
            if ($ngrokUrl) { break }
        } catch {}
        $attempts++
    }
}

if ($ngrokUrl) {
    Write-Host "-> Tunel HTTPS ngrok activo: $ngrokUrl" -ForegroundColor Green
} else {
    Write-Host "-> Tunel ngrok no detectado. Puedes usar la IP LAN directa." -ForegroundColor Yellow
}

# 5. Banner de Conectividad para el iPad
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "           URLs PARA CONFIGURAR EN TU iPAD                " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
if ($ngrokUrl) {
    Write-Host "  OPCION RECOMENDADA (HTTPS Tunel):" -ForegroundColor Green
    Write-Host "  $ngrokUrl" -ForegroundColor White -BackgroundColor DarkGreen
    Write-Host ""
}
Write-Host "  OPCION LAN DIRECTA (Misma red Wi-Fi):" -ForegroundColor Yellow
Write-Host "  http://${localIp}:3007" -ForegroundColor White -BackgroundColor DarkBlue
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Instrucciones en el iPad:" -ForegroundColor Gray
Write-Host "1. Abre iReader en Expo Go." -ForegroundColor Gray
Write-Host "2. Toca 'Configure Backend URL'." -ForegroundColor Gray
Write-Host "3. Pega una de las URLs de arriba y pulsa 'Save'." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 6. Iniciar Metro Bundler
Write-Host "[4/4] Iniciando Metro Bundler (Expo SDK 57)..." -ForegroundColor Yellow
Write-Host "Escanea el codigo QR que aparecera a continuacion con tu iPad:" -ForegroundColor Cyan
Write-Host ""

npm --prefix apps/mobile start
