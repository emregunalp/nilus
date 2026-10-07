# Builds en.html (English page) from index.html using the text pairs in i18n/en.json.
# Edit index.html and i18n/en.json, then run this script again; never edit en.html by hand.
# This file is ASCII on purpose: Windows PowerShell 5.1 misreads UTF-8 scripts without a BOM.
$root = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding $false
$html = [IO.File]::ReadAllText("$root\index.html", $utf8)
$pairs = ConvertFrom-Json ([IO.File]::ReadAllText("$root\i18n\en.json", $utf8))

# Longest first, so a whole sentence is translated before any word inside it can match on its own.
$missing = @()
foreach ($pair in ($pairs | Sort-Object { $_[0].Length } -Descending)) {
  if ($html.IndexOf($pair[0], [StringComparison]::Ordinal) -lt 0) { $missing += $pair[0]; continue }
  $html = $html.Replace($pair[0], $pair[1])
}

$note = "<!-- Generated from index.html by build-en.ps1. Edit index.html and i18n/en.json, then rebuild. -->"
$html = $html -replace '(?i)^<!doctype html>', "<!doctype html>`r`n$note"
[IO.File]::WriteAllText("$root\en.html", $html, $utf8)

# Anything still carrying Turkish letters was not translated (the "Turkce" language link is expected).
$turkish = '[\u00E7\u011F\u0131\u00F6\u015F\u00FC\u00C7\u011E\u0130\u00D6\u015E\u00DC\u00E2]'
$left = @()
$n = 0
foreach ($line in ($html -split "`n")) {
  $n++
  # Brand names keep their own spelling (matched loosely here so this file stays ASCII).
  $probe = $line -replace 'Pa.abah.e|Ar.elik|Eczac.ba..', ''
  if ($probe -cmatch $turkish -and $line -notmatch 'class="nav-lang"') { $left += ("{0}: {1}" -f $n, $line.Trim()) }
}
"en.html written ({0:N0} characters)" -f $html.Length
"pairs not found in index.html: $($missing.Count)"; $missing | ForEach-Object { "  - $_" }
"lines still in Turkish: $($left.Count)"; $left | ForEach-Object { "  $_" }
