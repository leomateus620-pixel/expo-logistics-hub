// Cache the exact dashboard fonts outside the repository so captures do not
// depend on Chromium's access to external font servers. No application changes.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const directory = path.join(os.tmpdir(), 'fenasoja-dashboard-fonts');
const cssPath = path.join(directory, 'fonts.css');
const siteCssPath = path.join(directory, 'site-fonts.css');
const fontFile = url => path.join(directory, path.basename(new URL(url).pathname));
async function cache() {
  if (process.platform === 'win32') {
    // PowerShell honors the host's Windows proxy configuration.
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `
      $ErrorActionPreference = 'Stop'
      $taskFontDir = Join-Path $env:TEMP 'fenasoja-dashboard-fonts'
      New-Item -ItemType Directory -Path $taskFontDir -Force | Out-Null
      $taskFontSheets = @{
        'fonts.css' = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap'
        'site-fonts.css' = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap'
      }
      foreach ($taskFontName in $taskFontSheets.Keys) {
        $taskFontSheet = Join-Path $taskFontDir $taskFontName
        if (-not (Test-Path -LiteralPath $taskFontSheet)) { Invoke-WebRequest -Uri $taskFontSheets[$taskFontName] -UserAgent 'Mozilla/5.0' -TimeoutSec 15 -OutFile $taskFontSheet }
      }
      $taskFontCss = (Get-Content (Join-Path $taskFontDir 'fonts.css') -Raw) + (Get-Content (Join-Path $taskFontDir 'site-fonts.css') -Raw)
      $taskFontUrls = [regex]::Matches($taskFontCss,'url\\((https://fonts\\.gstatic\\.com/[^)]+)\\)') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
      foreach ($taskFontUrl in $taskFontUrls) {
        $taskFontFile = Join-Path $taskFontDir ([IO.Path]::GetFileName(([uri]$taskFontUrl).AbsolutePath))
        if (-not (Test-Path -LiteralPath $taskFontFile)) { Invoke-WebRequest -Uri $taskFontUrl -TimeoutSec 15 -OutFile $taskFontFile }
      }
      Write-Output ('Cached font files: ' + $taskFontUrls.Count)
    `], { stdio: 'inherit', windowsHide: true });
    return;
  }
  fs.mkdirSync(directory, { recursive: true });
  if (!fs.existsSync(cssPath)) {
    const response = await fetch('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Could not cache dashboard font CSS');
    fs.writeFileSync(cssPath, await response.text());
  }
  if (!fs.existsSync(siteCssPath)) {
    const response = await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Could not cache application font CSS');
    fs.writeFileSync(siteCssPath, await response.text());
  }
  const css = fs.readFileSync(cssPath, 'utf8') + fs.readFileSync(siteCssPath, 'utf8');
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(match => match[1]))];
  await Promise.all(urls.map(async url => {
    if (fs.existsSync(fontFile(url))) return;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Could not cache dashboard font file');
    fs.writeFileSync(fontFile(url), Buffer.from(await response.arrayBuffer()));
  }));
  console.log(`Cached ${urls.length} dashboard font files outside repository`);
}
async function installQaFonts(page) {
  if (!fs.existsSync(cssPath)) throw new Error('Run node scripts/dashboard/presentation-fonts.cjs --cache first');
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(route.request().url().includes('Inter') ? siteCssPath : cssPath, 'utf8') }));
  await page.route('https://fonts.gstatic.com/**', route => route.fulfill({ status: 200, contentType: 'font/ttf', body: fs.readFileSync(fontFile(route.request().url())) }));
}
module.exports = { installQaFonts };
if (process.argv.includes('--cache')) cache().catch(error => { console.error(error.message); process.exitCode = 1; });
