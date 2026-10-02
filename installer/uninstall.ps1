# Liquid Glass Spotify - uninstaller
# Removes the Liquid Glass extension and the transparent-window-buttons flag.
# Spicetify itself and any other extensions are left untouched.

$ErrorActionPreference = "Continue"
$ExtName = "liquidGlass.js"
$Flag    = "--transparent-window-controls"

function Say($msg, $color = "White") { Write-Host $msg -ForegroundColor $color }

Clear-Host
Say "Removing Liquid Glass from Spotify..." Magenta

$Spicetify = Join-Path $env:LOCALAPPDATA "spicetify\spicetify.exe"
if (-not (Test-Path $Spicetify)) {
    $cmd = Get-Command spicetify -ErrorAction SilentlyContinue
    if ($cmd) { $Spicetify = $cmd.Source }
}
if (-not (Test-Path $Spicetify)) {
    Say "Spicetify isn't installed, so there's nothing to remove." Yellow
    Read-Host "Press Enter to close"; exit 0
}

$UserData = (& $Spicetify path userdata 2>$null | Select-Object -Last 1)
if (-not $UserData -or -not (Test-Path $UserData)) { $UserData = Join-Path $env:APPDATA "spicetify" }

# Remove from the extension list ("name-" removes it) and delete the file
& $Spicetify config extensions "$ExtName-" | Out-Null
Remove-Item (Join-Path $UserData "Extensions\$ExtName") -Force -ErrorAction SilentlyContinue

# Remove the launch flag from Spicetify's config
$ini = Join-Path $UserData "config-xpui.ini"
if (Test-Path $ini) {
    $text = [IO.File]::ReadAllText($ini)
    $text = $text -replace ('\|?' + [regex]::Escape($Flag)), ''
    $text = [regex]::Replace($text, '(?m)^(spotify_launch_flags\s*=)\s*\|', '$1 ')
    [IO.File]::WriteAllText($ini, $text, (New-Object Text.UTF8Encoding $false))
}

# Remove the flag from shortcuts and the startup entry
$shell = New-Object -ComObject WScript.Shell
foreach ($l in @(
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Spotify.lnk"),
    (Join-Path ([Environment]::GetFolderPath("Desktop")) "Spotify.lnk"))) {
    if (Test-Path $l) {
        $s = $shell.CreateShortcut($l)
        if ($s.Arguments -match [regex]::Escape($Flag)) { $s.Arguments = ($s.Arguments -replace [regex]::Escape($Flag), '').Trim(); $s.Save() }
    }
}
$run = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$auto = (Get-ItemProperty $run -ErrorAction SilentlyContinue).Spotify
if ($auto -and $auto -match [regex]::Escape($Flag)) { Set-ItemProperty $run -Name Spotify -Value (($auto -replace [regex]::Escape($Flag), '').Trim()) }

# Re-apply so Spotify reloads without the extension
Get-Process Spotify -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
$null = cmd /c "`"$Spicetify`" apply 2>&1"

Write-Host ""
Say "Liquid Glass removed. (To remove Spicetify completely, run:  spicetify restore)" Green
Write-Host ""
Read-Host "Press Enter to close"
