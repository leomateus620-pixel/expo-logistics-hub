const fs = require('node:fs');
const path = require('node:path');
const evidence = path.join(__dirname, 'evidence');
function read(name) {
  const file = path.join(evidence, name);
  const raw = fs.existsSync(file) ? fs.readFileSync(file) : require('node:zlib').gunzipSync(fs.readFileSync(file + '.gz'));
  return JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
}
const baseline = read('baseline-tests.json');
const candidate = read('candidate-tests.json');
function failures(report) {
  const found = new Map();
  for (const suite of report.testResults) {
    const file = suite.name.replace(/\\/g, '/').split('/src/test/')[1] || path.basename(suite.name);
    for (const test of suite.assertionResults || []) if (test.status === 'failed') {
      const key = `${file} :: ${test.fullName}`;
      found.set(key, { file, name: test.fullName, message: test.failureMessages?.[0]?.slice(0, 700) || null });
    }
    if (suite.status === 'failed' && !suite.assertionResults?.length) {
      found.set(`${file} :: [suite failed before assertions]`, { file, name: '[suite failed before assertions]', message: suite.message?.slice(0, 700) || null });
    }
  }
  return found;
}
const before = failures(baseline), after = failures(candidate);
const stats = report => ({ tests: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests,
  files: report.testResults.length, failedFiles: report.testResults.filter(s => s.status === 'failed').length,
  startTime: report.startTime });
const comparison = {
  baselineCommit: '8d48bb48378dfae73aae2a98dc9e1fdf367e96ce',
  method: 'Vitest full suites, maxWorkers=2, compare normalized test file plus full test name; source import failures retained separately.',
  baseline: stats(baseline), candidate: stats(candidate),
  newlyFailing: [...after].filter(([key]) => !before.has(key)).map(([, value]) => value),
  noLongerFailing: [...before].filter(([key]) => !after.has(key)).map(([, value]) => value),
  existingFailures: [...after].filter(([key]) => before.has(key)).map(([, value]) => ({ file: value.file, name: value.name })),
};
fs.writeFileSync(path.join(evidence, 'test-comparison.json'), JSON.stringify(comparison, null, 2));
console.log(JSON.stringify({ baseline: comparison.baseline, candidate: comparison.candidate,
  newlyFailing: comparison.newlyFailing, noLongerFailing: comparison.noLongerFailing }, null, 2));
