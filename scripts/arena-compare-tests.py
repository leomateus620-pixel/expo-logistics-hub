"""Fail CI for new or changed failures; report pre-existing failures explicitly."""
import json, sys
from pathlib import Path

def failures(path):
 data=json.loads(Path(path).read_text());cases={};suites={}
 for suite in data['testResults']:
  filename=suite['name'].split('/src/test/')[-1]
  for case in suite.get('assertionResults',[]):
   if case['status']=='failed':cases[filename+' :: '+case['fullName']]=case.get('failureMessages',[])
  if suite.get('status')=='failed' and not suite.get('assertionResults'):
   suites[filename]=suite.get('message','')
 return data,cases,suites
before,bf,bs=failures(sys.argv[1]);after,af,ass=failures(sys.argv[2])
new=set(af)-set(bf);new_suites=set(ass)-set(bs)
# Existing suite failures stay visible. Domain-targeted tests are an independent
# hard gate, not exempted by the baseline comparison.
report={'baseline':{k:before[k] for k in ['numTotalTests','numPassedTests','numFailedTests']},
 'candidate':{k:after[k] for k in ['numTotalTests','numPassedTests','numFailedTests']},
 'newFailures':sorted(new),'newFailedSuites':sorted(new_suites),'remainingBaselineFailures':sorted(set(af)&set(bf)),
 'fixedFailures':sorted(set(bf)-set(af)),'baselineSuiteFailures':sorted(bs),'candidateSuiteFailures':sorted(ass)}
Path(sys.argv[3]).write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
if new or new_suites:raise SystemExit(1)
