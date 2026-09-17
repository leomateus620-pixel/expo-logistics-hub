"""Fail CI on new/changed failures; keep every baseline failure visible.

Workspace prefixes and stack line numbers are not assertion identities. The
assertion message before its stack is compared as well as the test name, so an
already-failing test cannot silently acquire a new reconstruction regression.
"""
import json
import re
import sys
from pathlib import Path


def signature(messages):
    text = '\n'.join(messages) if isinstance(messages, list) else str(messages)
    text = re.sub(r'\x1b\[[0-9;]*m', '', text)
    return re.split(r'\n\s+at ', text, maxsplit=1)[0].strip()


def failures(path):
    data = json.loads(Path(path).read_text())
    cases, suites = {}, {}
    for suite in data['testResults']:
        filename = suite['name'].replace('\\', '/').split('/src/')[-1]
        for case in suite.get('assertionResults', []):
            if case['status'] == 'failed':
                cases[filename + ' :: ' + case['fullName']] = signature(case.get('failureMessages', []))
        if suite.get('status') == 'failed' and not suite.get('assertionResults'):
            suites[filename] = signature(suite.get('message', ''))
    return data, cases, suites


before, bf, bs = failures(sys.argv[1])
after, af, ass = failures(sys.argv[2])
new = set(af) - set(bf)
new_suites = set(ass) - set(bs)
changed = {name: {'before': bf[name], 'after': af[name]}
           for name in set(af) & set(bf) if af[name] != bf[name]}
report = {
    'baseline': {k: before[k] for k in ['numTotalTests', 'numPassedTests', 'numFailedTests']},
    'candidate': {k: after[k] for k in ['numTotalTests', 'numPassedTests', 'numFailedTests']},
    'newFailures': sorted(new), 'newFailedSuites': sorted(new_suites),
    'changedFailures': changed,
    'remainingBaselineFailures': sorted(set(af) & set(bf)),
    'fixedFailures': sorted(set(bf) - set(af)),
    'baselineSuiteFailures': sorted(bs), 'candidateSuiteFailures': sorted(ass),
}
Path(sys.argv[3]).write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
if new or new_suites or changed:
    raise SystemExit(1)
