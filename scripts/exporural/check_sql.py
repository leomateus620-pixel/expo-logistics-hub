"""Parser-only checks. No database, SQL execution or remote connections."""
import json, sys
from pathlib import Path
sys.path.insert(0,str(Path('.codex-tmp/exporural-python').resolve()))
import pglast
from pglast import parser
root=Path('docs/exporural/2028-revisao-2026-09-25')
result={'kind':'SYNTAX_ONLY_NOT_DATABASE_EXECUTION','parser':pglast.__version__,'files':{}}
for name in ['preflight.sql','carregar_payload.sql','migration_proposta.sql','verificacao_pos_migracao.sql']:
    sql=(root/name).read_text(encoding='utf-8')
    parsed=pglast.parse_sql(sql)
    print('Checking',name,flush=True)
    try:
        functions=json.loads(parser.parse_plpgsql_json(sql)) if name!='carregar_payload.sql' else []
    except Exception as error:
        print(name,repr(error),flush=True)
        raise
    result['files'][name]={'statements':len(parsed),'plpgsql_blocks':len(functions),'parsed':True}
(root/'evidencias/sql-sintaxe.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
