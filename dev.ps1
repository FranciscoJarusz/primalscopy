# Levanta todo el entorno local: anvil + contrato de raffles, backend y sitio Astro.
#   .\dev.ps1          levanta todo (cada proceso en su propia ventana)
#   .\dev.ps1 stop     cierra todo
#   .\dev.ps1 share    backend + sitio detras de un link publico de Cloudflare,
#                      sin raffles y sin poder publicar nada en produccion.
#                      Vos seguis usando http://localhost:4321 (se actualiza al
#                      guardar); el link muestra una copia compilada (4322).
#                      Ctrl+C corta el link.
#   .\dev.ps1 rebuild  pasa lo que tenes en el 4321 al link (la copia del 4322)
#   .\dev.ps1 tunnel   abre solo el link (link nuevo), con el resto ya levantado
param([string]$accion = "start")

$root    = $PSScriptRoot
$raffles = "C:\Users\imfra\Downloads\primal-raffles"
$foundry = "$env:USERPROFILE\.foundry\bin"
$puertos = 8545, 3001, 4321, 4322

function Ocupado($p) { [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) }
function Cerrar($p) {
  Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { taskkill /PID $_.OwningProcess /T /F | Out-Null }
}
function Esperar($p) { while (-not (Ocupado $p)) { Start-Sleep -Milliseconds 500 } }

if ($accion -eq "stop") {
  foreach ($p in $puertos) { Cerrar $p }
  Write-Host "Entornos cerrados."
  return
}

# La copia para el link: el build (el dev manda cientos de modulos sueltos y
# por el tunel tarda demasiado), servido en el 4322 por share-server.mjs, que
# le pasa /backend al backend. El tunel apunta al 4322 y no se toca.
function Publicar {
  Push-Location "$root\web"
  $env:PUBLIC_BACKEND_URL = '/backend/api'
  # Se mira el "Complete!" y no el codigo de salida: en Windows Node a veces
  # revienta al cerrarse (UV_HANDLE_CLOSING) despues de un build que salio bien.
  # Los codigos de color se sacan antes de buscar: en la terminal de VS Code
  # Astro pinta "[build]" y "Complete!" por separado, y los codigos quedan en
  # el medio del texto.
  $salida = npx astro build 2>&1 | Out-String
  $limpia = $salida -replace "$([char]27)\[[0-9;]*m", ''
  $ok = $limpia -match '\[build\]\s+Complete!'
  if (-not $ok) { Write-Host $salida }
  Remove-Item Env:PUBLIC_BACKEND_URL
  Pop-Location
  if (-not $ok) { Write-Host "El build fallo: corre 'npx astro build' en web/ para ver el error."; return $false }
  Cerrar 4322
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$env:PORT='4322'; cd '$root\web'; node --env-file-if-exists=.env scripts/share-server.mjs"
  Esperar 4322
  return $true
}

if ($accion -eq "rebuild") {
  if (Publicar) { Write-Host "Listo: el link ya tiene los cambios, que recargue." }
  return
}

if ($accion -eq "share" -or $accion -eq "tunnel") {
  $cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
  if (-not $cloudflared) {
    $cloudflared = Get-ChildItem "C:\Program Files*\cloudflared\cloudflared.exe" -ErrorAction SilentlyContinue |
      Select-Object -First 1 -ExpandProperty FullName
  }
  if (-not $cloudflared) { Write-Host "Falta cloudflared: winget install Cloudflare.cloudflared"; return }

  # Solo el link, con todo lo demas ya levantado (por ej. si se cerro esa ventana).
  if ($accion -eq "tunnel") {
    if (-not (Ocupado 4322)) { Write-Host "No hay nada en el 4322: corre .\dev.ps1 rebuild primero."; return }
    Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
    & $cloudflared tunnel --protocol http2 --url http://localhost:4322
    return
  }

  # Se relanzan: tienen que arrancar con esta configuracion.
  Cerrar 3001; Cerrar 4321; Cerrar 4322

  # Backend sin credenciales de produccion. Las variables del entorno le ganan
  # al .env, y un espacio cuenta como vacio: guardar queda solo en esta maquina.
  $sinProd = "`$env:SFTP_HOST=' '; `$env:SFTP_USER=' '; `$env:SFTP_REMOTE_ROOT=' '; " +
             "`$env:OPENSEA_API_KEY=' '; `$env:PROD_ADMIN_TOKEN=' '; `$env:UNLOCKED_TOKENS=' '"
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "$sinProd; cd '$root\backend'; npm run dev"

  # El dev para vos, como siempre.
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\web'; npm run dev"

  if (-not (Publicar)) { return }

  Esperar 3001; Esperar 4321
  Write-Host ""
  Write-Host "Backend y sitio listos (sin raffles, sin publicar en produccion)."
  Write-Host "Vos: http://localhost:4321. Para pasarle cambios al link: .\dev.ps1 rebuild (en otra terminal)."
  Write-Host "Abajo aparece el link https://....trycloudflare.com para pasarle al duenio."
  Write-Host "Ctrl+C lo corta. Despues: .\dev.ps1 stop; .\dev.ps1 para volver a lo normal."
  Write-Host ""
  # http2 y no QUIC: esta red (o WARP) corta el UDP al 7844 y QUIC nunca conecta.
  & $cloudflared tunnel --protocol http2 --url http://localhost:4322
  return
}

# 1. Blockchain local + contrato de raffles (el despliegue da siempre las mismas direcciones)
if (-not (Ocupado 8545)) {
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '$foundry\anvil.exe'"
  Esperar 8545
  Push-Location $raffles
  & "$foundry\forge.exe" script script/DesplegarLocal.s.sol --tc DesplegarLocal --rpc-url http://localhost:8545 --broadcast | Out-Null
  Pop-Location
  Write-Host "anvil + raffles desplegados"
}

# 2. Backend (3001) y 3. sitio Astro (4321)
if (-not (Ocupado 3001)) { Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; npm run dev" }
if (-not (Ocupado 4321)) { Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\web'; npm run dev" }

Write-Host ""
Write-Host "Sitio:    http://localhost:4321"
Write-Host "Raffles:  http://localhost:4321/raffles"
Write-Host "Backend:  http://localhost:3001"
