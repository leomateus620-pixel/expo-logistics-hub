const fs = require('node:fs');
const root = 'docs/validation/spatial-cleanup/';
const read = file => JSON.parse(fs.readFileSync(root+file,'utf8'));
const failures = report => report.testResults.flatMap(s=>s.assertionResults.filter(t=>t.status==='failed').map(t=>({file:s.name.split(/[\\/]/).pop(),test:t.fullName})));
const key = t => `${t.file}:${t.test}`;
const initial = read('map-tests.json'), baseline = read('map-baseline-failures.json'), focused = read('focused-final.json');
const base = new Set(failures(baseline).map(key));
const fixed = new Set(focused.testResults.flatMap(s=>s.assertionResults.filter(t=>t.status==='passed').map(t=>key({file:s.name.split(/[\\/]/).pop(),test:t.fullName}))));
const report = {
  baselineCommit:'42e89d1b',
  broad:{total:initial.numTotalTests,passed:initial.numPassedTests,failed:initial.numFailedTests},
  reproducedOnUnmodifiedBaseline:failures(initial).filter(t=>base.has(key(t))),
  resolvedByFinalFocusedRun:failures(initial).filter(t=>!base.has(key(t))&&fixed.has(key(t))),
  unresolvedNewFailures:failures(initial).filter(t=>!base.has(key(t))&&!fixed.has(key(t))),
  focused:{total:focused.numTotalTests,passed:focused.numPassedTests,failed:focused.numFailedTests},
};
fs.writeFileSync(root+'test-comparison.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({broad:report.broad,baselineFailures:report.reproducedOnUnmodifiedBaseline.length,fixed:report.resolvedByFinalFocusedRun.length,newFailures:report.unresolvedNewFailures.length,focused:report.focused}));
if(report.unresolvedNewFailures.length||focused.numFailedTests)process.exitCode=1;
