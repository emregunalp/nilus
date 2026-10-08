param([int]$Port = 5173)

# Local server for the Nilus site: static files plus the contact-form inbox.
#   POST api/dosyalar               → store one attachment (raw body, X-File-Name header) and return its id
#   GET  api/dosyalar/<id>          → read an attachment back (used by mesajlar.html)
#   POST api/mesajlar               → store a message (JSON: name, email, company, message, files: [ids]);
#                                     kind "brief" is a quote request and adds event, city, date, size
#   GET  api/mesajlar               → list messages, newest first (read by mesajlar.html)
#   POST api/mesajlar/<id>/okundu   → mark a message as read
# Everything lives under data/, which is never served as a static file.
# This script lives in _dev/ (kept out of the published site); the site is the folder above it.
$root = Split-Path $PSScriptRoot -Parent
$store = Join-Path $root 'data\mesajlar.json'
$uploads = Join-Path $root 'data\uploads'
$utf8 = New-Object System.Text.UTF8Encoding $false
$maxBody = 20000
$maxFileBytes = 15MB
$maxFiles = 5
$emailPattern = '^[^\s@]+@[^\s@]+\.[^\s@]+$'
$idPattern = '^[0-9a-f]{32}$'
$allowedExt = @('.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.txt', '.dwg', '.ai', '.psd')
# Only these are sent back with their own type; everything else is offered as a download.
$imageTypes = @{ '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.png' = 'image/png'; '.webp' = 'image/webp'; '.gif' = 'image/gif' }
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'; '.json' = 'application/json'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.woff2' = 'font/woff2'
  '.ico' = 'image/x-icon'; '.txt' = 'text/plain; charset=utf-8'
}

function Read-Messages {
  $list = @()
  if (Test-Path $store) {
    $parsed = ConvertFrom-Json ([IO.File]::ReadAllText($store, $utf8))
    foreach ($m in $parsed) { $list += $m }
  }
  return ,$list
}

function Write-Messages($list) {
  New-Item -ItemType Directory -Force (Split-Path $store) | Out-Null
  [IO.File]::WriteAllText($store, (ConvertTo-Json -InputObject @($list) -Depth 5), $utf8)
}

function Send-Json($ctx, [int]$status, $payload) {
  $bytes = $utf8.GetBytes((ConvertTo-Json -InputObject $payload -Depth 5))
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = 'application/json; charset=utf-8'
  $ctx.Response.Headers.Add('Cache-Control', 'no-store')
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Read-UploadMeta($id) {
  $metaPath = Join-Path $uploads "$id.meta.json"
  if ($id -notmatch $idPattern -or -not (Test-Path $metaPath)) { return $null }
  return ConvertFrom-Json ([IO.File]::ReadAllText($metaPath, $utf8))
}

function Add-Upload($ctx) {
  $length = $ctx.Request.ContentLength64
  if ($length -le 0 -or $length -gt $maxFileBytes) { Send-Json $ctx 413 @{ ok = $false }; return }
  try {
    $name = [IO.Path]::GetFileName([Uri]::UnescapeDataString([string]$ctx.Request.Headers['X-File-Name']))
  } catch { $name = '' }
  $name = ($name -replace '[\x00-\x1f]', '').Trim()
  $ext = [IO.Path]::GetExtension($name).ToLower()
  if (-not $name -or $name.Length -gt 150 -or $allowedExt -notcontains $ext) { Send-Json $ctx 415 @{ ok = $false }; return }
  New-Item -ItemType Directory -Force $uploads | Out-Null
  $id = [guid]::NewGuid().ToString('N')
  $target = Join-Path $uploads $id
  $total = 0
  $out = [IO.File]::Create($target)
  try {
    $buffer = New-Object byte[] 81920
    while (($read = $ctx.Request.InputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $total += $read
      if ($total -gt $maxFileBytes) { break }
      $out.Write($buffer, 0, $read)
    }
  } finally { $out.Close() }
  if ($total -gt $maxFileBytes) { Remove-Item $target -Confirm:$false; Send-Json $ctx 413 @{ ok = $false }; return }
  $meta = [pscustomobject]@{ id = $id; name = $name; size = $total; image = $imageTypes.ContainsKey($ext) }
  [IO.File]::WriteAllText((Join-Path $uploads "$id.meta.json"), (ConvertTo-Json -InputObject $meta), $utf8)
  Send-Json $ctx 201 @{ ok = $true; id = $id }
}

function Send-Upload($ctx, $id) {
  $meta = Read-UploadMeta $id
  $file = Join-Path $uploads $id
  if (-not $meta -or -not (Test-Path $file -PathType Leaf)) { $ctx.Response.StatusCode = 404; return }
  $ext = [IO.Path]::GetExtension($meta.name).ToLower()
  $ctx.Response.Headers.Add('X-Content-Type-Options', 'nosniff')
  $ctx.Response.Headers.Add('Cache-Control', 'no-store')
  if ($imageTypes.ContainsKey($ext)) {
    $ctx.Response.ContentType = $imageTypes[$ext]
  } else {
    $ctx.Response.ContentType = 'application/octet-stream'
    $ctx.Response.Headers.Add('Content-Disposition', "attachment; filename*=UTF-8''" + [Uri]::EscapeDataString($meta.name))
  }
  $bytes = [IO.File]::ReadAllBytes($file)
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Add-Message($ctx) {
  if ($ctx.Request.ContentLength64 -gt $maxBody) { Send-Json $ctx 413 @{ ok = $false }; return }
  $reader = New-Object IO.StreamReader($ctx.Request.InputStream, $utf8)
  $body = $reader.ReadToEnd()
  try { $in = ConvertFrom-Json $body } catch { Send-Json $ctx 400 @{ ok = $false }; return }
  if ([string]$in.website) { Send-Json $ctx 201 @{ ok = $true }; return } # filled trap field: a bot — accept and drop
  $name = ([string]$in.name).Trim()
  $email = ([string]$in.email).Trim()
  $company = ([string]$in.company).Trim()
  $message = ([string]$in.message).Trim()
  $valid = $name -and $name.Length -le 120 -and $email.Length -le 200 -and $email -match $emailPattern -and
    $company.Length -le 160 -and $message.Length -le 4000
  # A quote request only has to say who is asking: event name, city, date, stand size and the note are all
  # optional. A plain message needs its text.
  $kind = 'message'
  $brief = $null
  if ([string]$in.kind -eq 'brief') {
    $kind = 'brief'
    $brief = [pscustomobject]@{
      event = ([string]$in.event).Trim(); city = ([string]$in.city).Trim()
      date = ([string]$in.date).Trim(); size = ([string]$in.size).Trim()
    }
    $valid = $valid -and $brief.event.Length -le 160 -and $brief.city.Length -le 80 -and
      ($brief.date -eq '' -or $brief.date -match '^\d{4}-\d{2}-\d{2}$') -and $brief.size.Length -le 80
  } else {
    $valid = $valid -and $message
  }
  $files = @()
  foreach ($fileId in $in.files) {
    $meta = Read-UploadMeta ([string]$fileId)
    if ($meta) { $files += $meta } else { $valid = $false }
  }
  if (-not $valid -or $files.Count -gt $maxFiles) { Send-Json $ctx 422 @{ ok = $false }; return }
  $list = Read-Messages
  $list += [pscustomobject]@{
    id = [guid]::NewGuid().ToString('N'); date = (Get-Date).ToString('o')
    name = $name; email = $email; company = $company; message = $message; files = @($files); read = $false
    kind = $kind; brief = $brief
  }
  Write-Messages $list
  Send-Json $ctx 201 @{ ok = $true }
}

function Send-File($ctx, $path) {
  if ($path -eq '') { $path = 'index.html' }
  $file = [IO.Path]::GetFullPath((Join-Path $root $path))
  $private = $path -match '^(data|\.claude|_dev)(/|$)' -or $path -match '(^|/)\.' -or $path -like '*.ps1' -or $path -like '*.php'
  if ($private -or -not $file.StartsWith($root) -or -not (Test-Path $file -PathType Leaf)) { $ctx.Response.StatusCode = 404; return }
  $ext = [IO.Path]::GetExtension($file).ToLower()
  $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
  $ctx.Response.Headers.Add('Cache-Control', 'no-store')
  $bytes = [IO.File]::ReadAllBytes($file)
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Nilus preview: http://localhost:$Port/"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    # The site posts to the PHP addresses (api/mesajlar.php, api/dosyalar.php); here they are the same handlers.
    if ($path -match '^api/(mesajlar|dosyalar)\.php$') { $path = $path -replace '\.php$', '' }
    $method = $ctx.Request.HttpMethod
    if ($path -eq 'api/mesajlar' -and $method -eq 'POST') {
      Add-Message $ctx
    } elseif ($path -eq 'api/mesajlar' -and $method -eq 'GET') {
      $list = Read-Messages
      [array]::Reverse($list)
      Send-Json $ctx 200 @($list)
    } elseif ($path -match '^api/mesajlar/([0-9a-f]{32})/okundu$' -and $method -eq 'POST') {
      $id = $Matches[1]
      $list = Read-Messages
      $hit = $list | Where-Object { $_.id -eq $id }
      if ($hit) { $hit.read = $true; Write-Messages $list; Send-Json $ctx 200 @{ ok = $true } } else { Send-Json $ctx 404 @{ ok = $false } }
    } elseif ($path -eq 'api/dosyalar' -and $method -eq 'POST') {
      Add-Upload $ctx
    } elseif ($path -match '^api/dosyalar/([0-9a-f]{32})$' -and $method -eq 'GET') {
      Send-Upload $ctx $Matches[1]
    } elseif ($path -like 'api/*') {
      Send-Json $ctx 404 @{ ok = $false }
    } else {
      Send-File $ctx $path
    }
  } catch {
    Write-Host "error: $($_.Exception.Message)"
    try { $ctx.Response.StatusCode = 500 } catch {}
  }
  try { $ctx.Response.Close() } catch {}
}
