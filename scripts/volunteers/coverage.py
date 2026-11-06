"""Reproduce the coverage matrix from the sanitized connected audit snapshots."""
import json
import unicodedata
from pathlib import Path

root = Path(__file__).resolve().parents[2]
evidence = root / 'docs/volunteers/evidence'
catalog = json.loads((evidence / 'catalog.json').read_text())
units = json.loads((evidence / 'units-before.json').read_text())['rows']
leads = {r['id']: r['leads'] or [] for r in json.loads((evidence / 'authorized-leads.json').read_text())['rows']}
def norm(value):
    return ''.join(c for c in unicodedata.normalize('NFD', value.lower()) if not unicodedata.combining(c)).replace(' ', '-').replace(',', '')
def match(u):
    return next((r for r in catalog if norm(u['slug']) in [norm(s) for s in [r['entry']['id'], r['entry']['name'], r['entry'].get('moduleSlug', ''), r['entry'].get('mapPortalSlug', ''), *r['entry'].get('aliases', [])]]), None)

lines = ['# Matriz de cobertura — 06/11/2026', '',
'Auditoria do checkout `19d54148` e do banco conectado `btfaumhroqtqzxomqorx`, organização `985888b8-155f-4bbe-b6b9-6bef2893d99b`. Os 38 registros ativos incluem 37 comissões/assessorias e o CCPF (conselho). As 33 entradas dos cards oficiais são apenas parte da cobertura.', '',
'Todos os integrantes continuam vinculados por `commission_responsibles`, agora com `person_id → commission_people`. A coluna “Fonte” aplica-se à equipe inteira. Administração significa **admin ativo da mesma organização**; os nomes abaixo só autorizam gestão quando há conta vinculada e associação ativa, conforme consulta ao servidor. A lista não concede permissão.', '',
'| Unidade / tipo | Slug canônico e ID no banco | Aliases | Rota anterior / menu Equipe | Cadastro anterior | Fonte / integrantes ativos | Responsável autorizado | Alteração entregue / rota Equipe |',
'|---|---|---|---|---|---|---|---|']
for u in sorted((u for u in units if u['is_active']), key=lambda u:u['nome']):
    r=match(u); entry=r['entry'] if r else {}; module=r.get('module',{}) if r else {}
    slug=entry.get('id',u['slug']); base=module.get('basePath', '/comissoes/'+u['slug'])
    aliases=list(dict.fromkeys(s for s in [entry.get('moduleSlug'),entry.get('mapPortalSlug'),*entry.get('aliases',[])] if s and s!=slug))
    if slug=='ccpf':
        old='Ecossistema / Agenda; sem Equipe'; old_form='Conselho; fora do cadastro de voluntários'; change='Conselho preservado; não recebe gestão de equipe nem card novo'
    elif not r:
        old='Sem rota Equipe funcional auditada'; old_form='Registro institucional existente'; change='Diretório de equipes + rota funcional; sem criar card institucional'
    elif slug=='logistica-hotelaria-e-turismo':
        old=base+'/equipe; Equipe operacional'; old_form='Escalas/equipe operacional, sem este cadastro institucional'; change='Aba Voluntários + aba Escalas e operação preservada'
    elif slug in ['exporural','industria-comercio-e-servicos']:
        old=base+'/mapa-comercial; sem Equipe'; old_form='Não'; change='Menu Equipe e rota exata fora do redirecionamento de mapa'
    elif not r['reusesExistingModule']:
        old=base+'/equipe; lista do workspace'; old_form='Soja Store: 9 vínculos já persistidos, fotos legadas; sem formulário solicitado' if slug=='soja-store' else 'Lista institucional; sem formulário solicitado'; change='Cadastro compartilhado, mantendo navegação do workspace'
    else:
        paths=[m['path'] for m in module.get('menus',[])]
        old=base+'/dashboard; '+('“Equipes” em placeholder' if 'equipes' in paths else 'sem Equipe de voluntários'); old_form='Não; cadastros operacionais não substituem equipe de apoio'; change='Menu Equipe e tela funcional independente do placeholder'
    authorized=[x['name']+' ('+x['role']+')' for x in leads.get(u['id'],[]) if x['authorized']]
    pending=[x['name'] for x in leads.get(u['id'],[]) if not x['authorized']]
    manager='; '.join(authorized) if authorized else 'Somente administração até atribuição formal ativa'
    if pending: manager+='; sem conta ativa autorizada: '+', '.join(pending)
    if authorized: manager+='; + administração'
    route='' if slug=='ccpf' else '<br>`/comissoes/'+slug+'/equipe`'
    values=[u['nome']+'<br>'+u['unit_type'],f"`{slug}`<br>`{u['id']}`",'; '.join(aliases) or '—',old,old_form,f"commission_responsibles → commission_people; {u['active_count']}",manager,change+route]
    lines.append('| '+' | '.join(v.replace('|','/') for v in values)+' |')
lines += ['', '## Registros fora dos cards e aposentados', '',
'- `central`, `assessoria-projetos-e-captacoes-institucionais`, `etnias` e `relacoes-institucionais` estão ativos: recebem Equipe por `/equipes` e rota direta, sem novo card no portal ou alteração de sua visibilidade no Ecossistema.',
'- `ccpf` está ativo como conselho: mantém Ecossistema/Agenda e não é convertido em comissão ou assessoria.',
'- `fotografia` está inativa no banco: não é listada nem reativada. `limpeza` continua aposentada no catálogo.',
'- `espaco-automovel` e `espaco-do-automovel` resolvem para a mesma unidade persistida. Não existe uma segunda equipe para o mapa.',
'- Os 37 casos ativos e os aliases de Automóvel, ICS, Logística e Infraestrutura têm testes de montagem direta/remontagem da página. Autenticação e layout são isolados nesses testes; eles não representam 37 sessões reais em produção.', '',
'Geração: `python3 scripts/volunteers/coverage.py`. Evidência de responsáveis: [authorized-leads.json](evidence/authorized-leads.json). IDs antes/depois: [identity-map.json](evidence/identity-map.json).', '']
(root/'docs/volunteers/COVERAGE.md').write_text('\n'.join(lines))
print('Coverage written:',len([u for u in units if u['is_active']]),'active units')
