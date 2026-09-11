$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$artifactsPath = Join-Path $projectRoot '.test-artifacts'
New-Item -ItemType Directory -Force $artifactsPath | Out-Null
$jarPath = Join-Path $PSScriptRoot 'kosit-validator-1.6.3.jar'
$zipPath = Join-Path $artifactsPath 'xrechnung-2026-08-31.zip'
$downloads = @(
    @{ Url = 'https://github.com/itplr-kosit/validator/releases/download/v1.6.3/validator-1.6.3-standalone.jar'; Path = $jarPath; Hash = '799e64befca97d4080e03608c80b85dd5a5ecc5f4ae4f35d1116ec2855b9a7c9' },
    @{ Url = 'https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v2026-08-31/xrechnung-3.0.2-validator-configuration-2026-08-31.zip'; Path = $zipPath; Hash = '2530cd107c414511c5d0462ec10f886910395abfca820db82e83d70bf01221a8' }
)
foreach ($item in $downloads) {
    if ((Test-Path -LiteralPath $item.Path) -and (Get-FileHash -LiteralPath $item.Path).Hash -eq $item.Hash) { continue }
    $downloadPath = $item.Path + '.download'
    try {
        Invoke-WebRequest $item.Url -OutFile $downloadPath
        if ((Get-FileHash -LiteralPath $downloadPath).Hash -ne $item.Hash) { throw 'KoSIT-Download-Prüfsumme stimmt nicht.' }
        Move-Item -LiteralPath $downloadPath -Destination $item.Path -Force
    } finally {
        if (Test-Path -LiteralPath $downloadPath) { Remove-Item -LiteralPath $downloadPath }
    }
}
Expand-Archive -LiteralPath $zipPath -DestinationPath (Join-Path $artifactsPath 'kosit-config') -Force
Write-Host 'KoSIT als optionale Entwicklungsreferenz installiert. JDK 17+: npm run test:kosit'
