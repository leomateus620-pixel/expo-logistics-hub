# Windows built-in Portuguese OCR. Draft evidence only, never an editorial approval.
param([string]$Root = (Resolve-Path "$PSScriptRoot/../..").Path)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null = [Windows.Globalization.Language,Windows.Foundation,ContentType=WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await-Result($operation, [Type]$resultType) {
    $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
    $task.Wait()
    $task.Result
}
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('pt-BR'))
$draftDir = Join-Path $Root 'docs/memorial/ocr-drafts'
New-Item -ItemType Directory -Path $draftDir -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $Root 'public/memorial-voluntariado/faces') -Filter '*.webp' | Where-Object { $_.Name -ne 'fenasoja-2028.webp' } | ForEach-Object {
    $file = Await-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync($_.FullName)) ([Windows.Storage.StorageFile])
    $stream = Await-Result ($file.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Foundation,ContentType=WindowsRuntime])
    $decoder = Await-Result ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await-Result ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap,Windows.Foundation,ContentType=WindowsRuntime])
    $result = Await-Result ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult,Windows.Foundation,ContentType=WindowsRuntime])
    $lines = @($result.Lines | ForEach-Object {
        @{ text = $_.Text; words = @($_.Words | ForEach-Object { @{ text = $_.Text; x = $_.BoundingRect.X; y = $_.BoundingRect.Y; width = $_.BoundingRect.Width; height = $_.BoundingRect.Height } }) }
    })
    @{ engine = 'Windows.Media.Ocr pt-BR'; status = 'UNREVIEWED_DRAFT'; lines = $lines } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $draftDir ($_.BaseName + '.json')) -Encoding UTF8
    Write-Output ($_.BaseName + ': ' + $lines.Count + ' OCR lines')
    $bitmap.Dispose(); $stream.Dispose()
}
