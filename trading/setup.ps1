# One-time setup on Windows. In PowerShell, from this folder:
#   powershell -ExecutionPolicy Bypass -File setup.ps1
# Needs Python 3.12 (python.org installer, tick "Add to PATH"). Zipline has no
# ready-made package for 3.13+ parts, so 3.12 is required.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$pyExe = $null; $pyArgs = @()
try { & py -3.12 -c "import sys" 2>$null; if ($LASTEXITCODE -eq 0) { $pyExe = "py"; $pyArgs = @("-3.12") } } catch {}
if (-not $pyExe) {
    try {
        $v = & python -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
        if ($v -eq "3.12") { $pyExe = "python" }
    } catch {}
}
if (-not $pyExe) {
    Write-Host "Python 3.12 not found. Install it from https://www.python.org/downloads/ (pick a 3.12.x release) then run this again." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path ".venv")) {
    Write-Host "Creating .venv ..."
    & $pyExe @pyArgs -m venv .venv
}
$vpy = ".\.venv\Scripts\python.exe"
& $vpy -m pip install --upgrade pip -q
Write-Host "Installing packages (a few minutes the first time) ..."
& $vpy -m pip install --prefer-binary -r requirements.txt -q
if ($LASTEXITCODE -ne 0) { Write-Host "Package install failed. Paste the error to Claude." -ForegroundColor Red; exit 1 }

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env - open it and paste your keys." -ForegroundColor Yellow
}

Write-Host "Running quick self-test ..."
& $vpy scripts\cli.py selftest
if ($LASTEXITCODE -ne 0) { Write-Host "Self-test failed. Paste the output to Claude." -ForegroundColor Red; exit 1 }
Write-Host ""
Write-Host "Ready. Use .\trader.bat <command>, e.g.  .\trader.bat probe" -ForegroundColor Green
