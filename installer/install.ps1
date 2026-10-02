# Liquid Glass Spotify - installer
# Installs Spicetify (if needed) and the Liquid Glass extension into the Spotify desktop app.

# Errors are checked explicitly below (Windows PowerShell treats native stderr as errors otherwise)
$ErrorActionPreference = "Continue"
$ExtName  = "liquidGlass.js"
$Flag     = "--transparent-window-controls"
$Here     = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExtSrc   = Join-Path (Split-Path -Parent $Here) $ExtName

function Say($msg, $color = "White") { Write-Host $msg -ForegroundColor $color }
function Step($msg) { Write-Host ""; Write-Host ">> $msg" -ForegroundColor Cyan }
function Fail($msg) {
    Write-Host ""
    Write-Host "ERROR: $msg" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}

Clear-Host
Say "==============================================" Magenta
Say "        Liquid Glass for Spotify - Setup       " Magenta
Say "==============================================" Magenta

# --- 0. Sanity checks ---------------------------------------------------------
if (-not (Test-Path $ExtSrc)) { Fail "Can't find $ExtName next to the installer. Extract the whole zip first, then run Install.bat." }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) { Fail "Please don't run this as Administrator. Just double-click Install.bat normally." }

# --- 1. Spotify ---------------------------------------------------------------
Step "Checking Spotify"
$SpotifyExe = Join-Path $env:APPDATA "Spotify\Spotify.exe"
$storeApp = Get-AppxPackage -Name "*SpotifyMusic*" -ErrorAction SilentlyContinue

if (-not (Test-Path $SpotifyExe)) {
    if ($storeApp) {
        Say "You have the Microsoft Store version of Spotify, which Spicetify can't modify." Yellow
        Say "Please uninstall it, then install Spotify from spotify.com/download and run this again." Yellow
    } else {
        Say "Spotify desktop isn't installed." Yellow
        Say "Install it from spotify.com/download, open it and log in once, then run this again." Yellow
    }
    Start-Process "https://www.spotify.com/download/windows/"
    Fail "Spotify (from spotify.com) is required."
}
Say "Found Spotify: $SpotifyExe" Green

# --- 2. Spicetify ---------------------------------------------------------------
Step "Checking Spicetify"
$Spicetify = Join-Path $env:LOCALAPPDATA "spicetify\spicetify.exe"
if (-not (Test-Path $Spicetify)) {
    $cmd = Get-Command spicetify -ErrorAction SilentlyContinue
    if ($cmd) { $Spicetify = $cmd.Source }
}

$FreshSpicetify = $false
if (-not (Test-Path $Spicetify)) {
    $FreshSpicetify = $true
    Say "Spicetify isn't installed. Installing it from the official source (github.com/spicetify)..." Yellow
    Say "(Marketplace is not installed - only what Liquid Glass needs.)" DarkGray
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $setup = (Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/spicetify/cli/main/install.ps1").Content
        # Their script offers Marketplace and defaults to "Yes" when nobody answers,
        # so cut that section out before running it.
        $trimmed = [regex]::Replace($setup, '(?s)#region Marketplace.*?#endregion Marketplace', '')
        Invoke-Expression $trimmed
    } catch {
        Fail "Couldn't install Spicetify: $($_.Exception.Message)"
    }
    $Spicetify = Join-Path $env:LOCALAPPDATA "spicetify\spicetify.exe"
    if (-not (Test-Path $Spicetify)) { Fail "Spicetify install didn't finish. Try running this installer again." }
}
Say "Spicetify: $Spicetify" Green

# Make sure Spicetify has created its config
& $Spicetify config | Out-Null
$UserData = (& $Spicetify path userdata 2>$null | Select-Object -Last 1)
if (-not $UserData -or -not (Test-Path $UserData)) { $UserData = Join-Path $env:APPDATA "spicetify" }

# Safety net for fresh installs: make sure Marketplace didn't sneak in.
# (An existing Spicetify setup is left exactly as the user had it.)
if ($FreshSpicetify) {
    $apps = (& $Spicetify config custom_apps) -join ""
    if ($apps -match "marketplace") { & $Spicetify config custom_apps "marketplace-" | Out-Null }
    Remove-Item (Join-Path $UserData "CustomApps\marketplace") -Recurse -Force -ErrorAction SilentlyContinue
}

# --- 3. Extension -------------------------------------------------------------
Step "Installing the Liquid Glass extension"
$ExtDir = Join-Path $UserData "Extensions"
New-Item -ItemType Directory -Force $ExtDir | Out-Null
Copy-Item $ExtSrc (Join-Path $ExtDir $ExtName) -Force

# Add to the extension list without removing the user's other extensions
$current = (& $Spicetify config extensions) -join ""
if ($current -notmatch [regex]::Escape($ExtName)) {
    & $Spicetify config extensions $ExtName | Out-Null
}
Say "Extension installed." Green

# --- 4. Transparent window buttons ---------------------------------------------
Step "Making the window buttons transparent"
# Spicetify's CLI treats values starting with '--' as its own options, so edit its config file directly.
$ini = Join-Path $UserData "config-xpui.ini"
if (Test-Path $ini) {
    $text = [IO.File]::ReadAllText($ini)
    if ($text -notmatch [regex]::Escape($Flag)) {
        $text = [regex]::Replace($text, '(?m)^(spotify_launch_flags\s*=)[ \t]*(.*)$', {
            param($m)
            $existing = $m.Groups[2].Value.Trim()
            if ($existing) { "$($m.Groups[1].Value) $existing|$Flag" } else { "$($m.Groups[1].Value) $Flag" }
        })
        [IO.File]::WriteAllText($ini, $text, (New-Object Text.UTF8Encoding $false))
    }
}

# Start menu / desktop shortcuts and the "start with Windows" entry
$shell = New-Object -ComObject WScript.Shell
$links = @(
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Spotify.lnk"),
    (Join-Path ([Environment]::GetFolderPath("Desktop")) "Spotify.lnk")
)
foreach ($l in $links) {
    if (Test-Path $l) {
        $s = $shell.CreateShortcut($l)
        if ($s.Arguments -notmatch [regex]::Escape($Flag)) { $s.Arguments = ($s.Arguments + " " + $Flag).Trim(); $s.Save() }
    }
}
$run = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$auto = (Get-ItemProperty $run -ErrorAction SilentlyContinue).Spotify
if ($auto -and $auto -notmatch [regex]::Escape($Flag)) { Set-ItemProperty $run -Name Spotify -Value "$auto $Flag" }
Say "Done." Green

# --- 5. Apply --------------------------------------------------------------------
Step "Applying to Spotify (Spotify will restart)"
Get-Process Spotify -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# Run spicetify through cmd so its progress output (written to stderr) doesn't show up as PowerShell errors
function Invoke-Spicetify([string]$SpArgs) { (cmd /c "`"$Spicetify`" $SpArgs 2>&1") -join "`n" }

# Success = our extension file ended up inside Spotify, identical to the one we ship
$Applied = Join-Path $env:APPDATA "Spotify\Apps\xpui\extensions\$ExtName"
function Test-Applied {
    (Test-Path $Applied) -and ((Get-FileHash $Applied).Hash -eq (Get-FileHash $ExtSrc).Hash)
}
Remove-Item $Applied -Force -ErrorAction SilentlyContinue

$attempts = @(
    @{ Args = "backup apply";         Why = "first-time setup" },
    @{ Args = "apply";                Why = "existing Spicetify setup" },
    @{ Args = "restore backup apply"; Why = "refreshing after a Spotify update" }
)
$log = ""
foreach ($a in $attempts) {
    Say "   trying: spicetify $($a.Args)  ($($a.Why))" DarkGray
    $log += "`n== spicetify $($a.Args) ==`n" + (Invoke-Spicetify $a.Args)
    if (Test-Applied) { break }
}
if (-not (Test-Applied)) {
    $logFile = Join-Path $env:TEMP "liquid-glass-install.log"
    $log | Out-File $logFile -Encoding utf8
    Fail "Spicetify couldn't apply the changes. Details saved to $logFile"
}
Say "Applied." Green

Start-Sleep -Seconds 3
if (-not (Get-Process Spotify -ErrorAction SilentlyContinue)) {
    Start-Process $SpotifyExe -ArgumentList $Flag
}

Write-Host ""
Say "==============================================" Magenta
Say "  All set! Enjoy Liquid Glass Spotify." Green
Say "  - Play a song: its Canvas video plays behind the app." White
Say "  - Open lyrics (mic button) for the glowing lyrics view." White
Say "  - After a Spotify update, just run Install.bat again." White
Say "==============================================" Magenta
Write-Host ""
Read-Host "Press Enter to close"
