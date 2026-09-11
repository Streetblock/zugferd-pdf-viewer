$ErrorActionPreference = 'Stop'
$validatorPath = Join-Path $PSScriptRoot 'Mustang-CLI-2.26.0.jar'
$downloadPath = "$validatorPath.download"
$expectedHash = '42D7868CB68264874A7B8CAB4C3587B03B23CCC7CD72373DA917F66758BB9736'
try {
    Invoke-WebRequest 'https://github.com/ZUGFeRD/mustangproject/releases/download/core-2.26.0/Mustang-CLI-2.26.0.jar' -OutFile $downloadPath
    if ((Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash -ne $expectedHash) {
        throw 'Download-Prüfsumme stimmt nicht. Installation abgebrochen.'
    }
    Move-Item -LiteralPath $downloadPath -Destination $validatorPath -Force
    Write-Host 'Mustangproject 2.26.0 als Entwicklungsreferenz installiert. Start: npm run dev:reference (Node 20+, JDK 17+).'
} finally {
    if (Test-Path -LiteralPath $downloadPath) { Remove-Item -LiteralPath $downloadPath }
}
