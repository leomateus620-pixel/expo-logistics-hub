/* Compare Vitest JSON from an immutable main checkout and the candidate. */
const fs = require('node:fs');
const [beforePath, afterPath, outputPath] = process.argv.slice(2);
if (!beforePath || !afterPath || !outputPath) throw new Error('Usage: node compare-tests.cjs before.json after.json output.json');
const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
const failures = report => report.testResults.flatMap(file => file.assertionResults
  .filter(test => test.status === 'failed').map(test => ({ file: `src/${file.name.split('/src/').pop()}`, test: test.fullName })));
const key = test => `${test.file}: ${test.test}`;
const baseline = failures(before), candidate = failures(after);
const baselineKeys = new Set(baseline.map(key)), candidateKeys = new Set(candidate.map(key));
const totals = report => ({ files: report.testResults.length, failedFiles: report.testResults.filter(file => file.status === 'failed').length,
  tests: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests });
const result = { baselineCommit: 'eb85dedbafbc76b1beeb617e40487c63896c05e2', baseline: totals(before), candidate: totals(after),
  newFailures: candidate.filter(test => !baselineKeys.has(key(test))), resolvedFailures: baseline.filter(test => !candidateKeys.has(key(test))),
  retainedFailures: candidate.filter(test => baselineKeys.has(key(test))) };
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ baseline: result.baseline, candidate: result.candidate, newFailures: result.newFailures, resolvedFailures: result.resolvedFailures }));
if (result.newFailures.length) process.exitCode = 1;
