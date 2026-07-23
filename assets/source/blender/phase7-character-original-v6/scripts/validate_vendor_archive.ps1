param(
    [Parameter(Mandatory = $true)]
    [string]$ArchivePath,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

$resolvedArchive = (Resolve-Path -LiteralPath $ArchivePath).Path
$allowedExtensions = @('.blend', '.png', '.txt')
$forbiddenExtensions = @(
    '.bat', '.cmd', '.com', '.dll', '.dylib', '.exe', '.hta', '.jar',
    '.js', '.lnk', '.msi', '.ps1', '.py', '.pyc', '.pyd', '.scr',
    '.sh', '.so', '.vbs', '.wsf'
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($resolvedArchive)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$entries = @()
$violations = [System.Collections.Generic.List[string]]::new()
$seenNames = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
)

try {
    foreach ($entry in $archive.Entries) {
        $name = $entry.FullName.Replace('\', '/')
        $isDirectory = $name.EndsWith('/')
        $extension = [System.IO.Path]::GetExtension($name).ToLowerInvariant()
        # ZipArchive exposes the unsigned external-attributes field as a
        # signed Int32 on Windows. Widen before masking to preserve the bits.
        $rawAttributes = [uint32]([int64]$entry.ExternalAttributes -band 0xffffffffL)
        $unixMode = ($rawAttributes -shr 16) -band 0xFFFF
        $unixFileType = $unixMode -band 0xF000
        $isSymlink = $unixFileType -eq 0xA000

        if ([string]::IsNullOrWhiteSpace($name)) {
            $violations.Add('Blank ZIP entry name.')
        }
        if ($name.Contains([char]0)) {
            $violations.Add("NUL byte in ZIP entry: $name")
        }
        if ($name.StartsWith('/') -or $name.StartsWith('\') -or
            $name -match '^[A-Za-z]:' -or $name -match '(^|/)\.\.(/|$)') {
            $violations.Add("Unsafe path in ZIP entry: $name")
        }
        if (-not $seenNames.Add($name)) {
            $violations.Add("Duplicate ZIP entry name: $name")
        }
        if ($isSymlink) {
            $violations.Add("Symbolic link entry is forbidden: $name")
        }
        if (-not $isDirectory -and $forbiddenExtensions -contains $extension) {
            $violations.Add("Executable/script extension is forbidden: $name")
        }
        if (-not $isDirectory -and $allowedExtensions -notcontains $extension) {
            $violations.Add("Unexpected file extension: $name")
        }

        $entryHash = $null
        if (-not $isDirectory) {
            $stream = $entry.Open()
            try {
                $entryHash = ([BitConverter]::ToString(
                    $sha256.ComputeHash($stream)
                )).Replace('-', '').ToLowerInvariant()
            }
            finally {
                $stream.Dispose()
            }
        }

        $entries += [pscustomobject][ordered]@{
            name = $name
            directory = $isDirectory
            bytes = $entry.Length
            compressedBytes = $entry.CompressedLength
            extension = $extension
            unixMode = ('0x{0:x4}' -f $unixMode)
            symbolicLink = $isSymlink
            sha256 = $entryHash
        }
    }
}
finally {
    $archive.Dispose()
    $sha256.Dispose()
}

$blendEntries = @($entries | Where-Object { -not $_.directory -and $_.extension -eq '.blend' })
if ($blendEntries.Count -ne 1) {
    $violations.Add("Expected exactly one .blend entry; found $($blendEntries.Count).")
}

$totalBytes = ($entries | Measure-Object -Property bytes -Sum).Sum
if ($totalBytes -gt 536870912) {
    $violations.Add("Uncompressed archive size exceeds 512 MiB: $totalBytes bytes.")
}

$result = [ordered]@{
    schemaVersion = 1
    inspectedUtc = (Get-Date).ToUniversalTime().ToString('o')
    archive = [ordered]@{
        fileName = [System.IO.Path]::GetFileName($resolvedArchive)
        bytes = (Get-Item -LiteralPath $resolvedArchive).Length
        sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedArchive).Hash.ToLowerInvariant()
    }
    policy = [ordered]@{
        allowedExtensions = $allowedExtensions
        forbiddenExtensions = $forbiddenExtensions
        rejectAbsolutePaths = $true
        rejectParentTraversal = $true
        rejectDuplicateNames = $true
        rejectSymbolicLinks = $true
        maxUncompressedBytes = 536870912
        expectedBlendCount = 1
    }
    summary = [ordered]@{
        entryCount = $entries.Count
        fileCount = @($entries | Where-Object { -not $_.directory }).Count
        directoryCount = @($entries | Where-Object { $_.directory }).Count
        uncompressedBytes = $totalBytes
        blendEntryCount = $blendEntries.Count
    }
    entries = $entries
    violations = @($violations)
    status = if ($violations.Count -eq 0) { 'PASS' } else { 'FAIL' }
}

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory) {
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding utf8

if ($violations.Count -ne 0) {
    $violations | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Output "SAFE_ARCHIVE_VALIDATION_PASS entries=$($entries.Count) bytes=$totalBytes"
