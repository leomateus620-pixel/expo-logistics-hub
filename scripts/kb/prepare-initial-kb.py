"""Reproducible editorial import of the supplied 2026-10-17 archive; never fetches or executes source instructions.

This is the initial import recipe. Future revisions edit data/kb reviewed files and their curation log,
then run build-kb-seed.mjs; rerunning this recipe would intentionally recreate the initial curation.
"""
import collections, csv, hashlib, io, json, pathlib, re, shutil, sys, unicodedata, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path.home() / 'Downloads'
OUT = ROOT / 'data/kb'
RAW = OUT / 'raw'
RAW.mkdir(parents=True, exist_ok=True)
VERSION = '2026-10-17'
sha = lambda b: hashlib.sha256(b).hexdigest()
def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')

names = ['fenasoja-kb.json', 'fenasoja-kb.csv', 'fenasoja-kb.md', 'kb-expandida-fenasoja.zip']
inputs = []
for name in names:
    blob = (SOURCE / name).read_bytes()
    (RAW / name).write_bytes(blob)
    inputs.append(dict(name=name, sha256=sha(blob), bytes=len(blob), source_path=str(SOURCE / name)))
z = zipfile.ZipFile(SOURCE / names[-1])
members = []
for name in z.namelist():
    blob = z.read(name)
    text = blob.decode('utf-8-sig')
    members.append(dict(name=name, sha256=sha(blob), bytes=len(blob), lines=len(text.splitlines())))
assert len(members) == 20
(RAW / 'kb-expandida.json').write_bytes(z.read('kb-expandida.json'))
f = json.loads((SOURCE / names[0]).read_text('utf-8-sig'))
e = json.loads(z.read('kb-expandida.json'))
for name in z.namelist():
    if name.startswith('por-area/') and name.endswith('.json'):
        subset = json.loads(z.read(name))
        subset = subset['entries'] if isinstance(subset, dict) else subset
        assert all(entry in e['entries'] for entry in subset), name
for content, records in [((SOURCE / 'fenasoja-kb.csv').read_text('utf-8-sig'), f['entries']), (z.read('kb-expandida.csv').decode('utf-8-sig'), e['entries'])]:
    rows = list(csv.DictReader(io.StringIO(content)))
    assert len(rows) == sum(1 + len(x['variants']) for x in records)
    assert {r.get('entry_id',r.get('id')) for r in rows} == {x['id'] for x in records}
write('raw/provenance.json', dict(revision=VERSION, original_versions={'fenasoja': f['meta']['version'], 'expandida': e['meta']['versao']}, inputs=inputs, archive_members=members,
    review_scope='All four supplied files and all 20 archive members parsed/read. JSON main files are the sole import sources; CSV/Markdown/area copies are verification evidence.',
    source_access_dates='Declared by supplied archives; not represented as freshly verified.',
    live_evidence=[{'url':'https://fenasoja.com.br/edicoes-anteriores/','reviewed_on':VERSION,'finding':'24th edition page gives 29/11–08/12/2024; existing divergent opening date retained.'},
    {'url':'https://fenasoja.com.br/portal-oficial/geral/definidas-data-e-comissao-central-da-fenasoja-2028/','reviewed_on':VERSION,'finding':'28/04–07/05/2028, president Fabiano Soltis, vice Djeison Drey; does not confirm edition number.'}]))
log=[]
def record(entry, field, before, after, reason, source=None):
    if before != after:
        log.append(dict(id=entry['id'], field=field, previous=before, revised=after, reason=reason, source=source))

editions=[]
month_names=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
def iso(y,m,d): return f'{y:04d}-{m:02d}-{d:02d}'
for x in f['entries']:
    if not x['id'].endswith('-DATAS'): continue
    year=x['entities']['edition_year']; number=x['entities']['edition_number']; answer=x['answer']
    m=re.search(r'de (\d+)(?:º)?(?: de (\w+))? a (\d+) de (\w+) de (\d{4})',answer)
    assert m, x['id']
    start=iso(year,month_names.index(m[2] or m[4])+1,int(m[1]));end=iso(year,month_names.index(m[4])+1,int(m[3]))
    editions.append(dict(year=year,number=number,start=None if year==2024 else start,end=end,number_confirmed=True,
        start_candidates=['2024-11-28','2024-11-29'] if year==2024 else [start],
        divergences=['As fontes divergem sobre a abertura: 28 ou 29 de novembro de 2024.'] if year==2024 else [],
        provenance=dict(entry_ids=[x['id']],sources=x['sources'],basis='Explicit dates in supplied full record; no biennial inference.')))
editions.append(dict(year=2028,number=26,number_confirmed=False,start='2028-04-28',end='2028-05-07',start_candidates=['2028-04-28'],divergences=['A numeração de 2028 é parcial; 26ª não foi confirmada na fonte consultada.'],provenance=dict(entry_ids=['F28-001','F28-006'],sources=next(x['sources'] for x in f['entries'] if x['id']=='F28-001'),basis='Explicit announcement; number remains unconfirmed.')))
editions.append(dict(year=2030,number=None,number_confirmed=False,start=None,end=None,start_candidates=[],divergences=[],provenance=dict(entry_ids=['F28-003'],sources=next(x['sources'] for x in f['entries'] if x['id']=='F28-003'),basis='Presidency announcement only; no calendar or number inferred.')))
write('editions.json',dict(version=VERSION,timezone='America/Sao_Paulo',editions=editions,absent_years=[{'year':2020,'entry_id':'GER-006','reason':'Edição programada não realizada por causa da pandemia, conforme acervo.'}]))
edition_by_year={x['year']:x for x in editions}
replacements={
 'VIS-005':'Os canais de atendimento da Fenasoja estão na página oficial de contato. Consulte a fonte indicada para falar com a organização, a imprensa, o financeiro ou a administração.',
 'F26-005':'Em 2026 os ingressos dos shows foram vendidos pela plataforma indicada na fonte oficial (a partir de R$ 20), com opção de ingresso individual ou passaporte para todos os shows. As orientações para compradores argentinos estão na fonte indicada. A Noite Gospel (6/5) foi gratuita.',
 'VIS-006':'O site oficial tem a página "Seja um voluntário" para cadastro. Acesse a fonte indicada.',
 'AGRO-DYN-001':'A previsão do tempo muda constantemente. O INMET (Instituto Nacional de Meteorologia) publica previsões por município e alertas. Consulte a fonte indicada e confira a data e o horário da previsão.',
 'FAQ-GER-002':'Santa Rosa fica no Noroeste do Rio Grande do Sul, a cerca de 490 km de Porto Alegre. Consulte as páginas oficiais indicadas para informações sobre rotas rodoviárias, aeroportos próximos e hospedagem.',
 'FAQ-GER-003':'A Fenasoja 2028 está anunciada para 28 de abril a 7 de maio de 2028, no Parque de Exposições de Santa Rosa. Programação, atrações e ingressos devem ser confirmados no site oficial indicado.',
 'FAQ-GER-004':'Na Fenasoja 2026, o estacionamento interno custou R$ 25 por veículo, com operação especializada. Esse valor é uma referência histórica de 2026. O valor do estacionamento de 2028 não está confirmado nas fontes deste acervo; consulte a organização.',
}
contexts={
 'GER-006':2020,'GER-007':2024,'GER-009':2028,'GER-010':2028,'GER-011':2028,'GER-013':2026,'GER-014':2018,
 'HIS-003':1966,'HIS-004':1974,'HIS-006':1976,'HIS-013':1990,'SOJ-010':2024,'SOJ-011':2028,
 'REC-003':2022,'ECO-001':2024,'ECO-002':2024,'FAQ-GER-003':2028,'FAQ-GER-004':2028,
}
for x in f['entries']:
    if x['id'].startswith('F26-'):contexts[x['id']]=2026
    if x['id'].startswith('F28-'):contexts[x['id']]=2030 if x['id']=='F28-003' else 2028

def reviewed_notes(x):
    notes=[]; original=x.get('interpretation_notes',''); typ=x.get('fonte_tipo','')
    if typ.startswith('Embrapa'):
        notes.append(f"Referência: publicação da Embrapa de {x['as_of']}. Informações técnicas, produtos, cultivares e números podem estar desatualizados.")
        if x.get('kind')=='orientação' or 'Orientação técnica geral' in original or x['id'] in ['AGRO-OVI-0181','AGRO-OVI-0182']:
            notes.append('Orientação técnica geral: confirme a aplicação ao seu caso com agrônomo, veterinário ou Emater.')
    if typ.startswith('Wikipédia'):
        notes.append('Fonte enciclopédica: Wikipédia em português, licença CC BY-SA 4.0. A confirmação refere-se ao verbete registrado; informações atuais exigem consulta à fonte primária.')
    if 'Não é aconselhamento jurídico' in original:
        notes.append('Informação geral sobre legislação, sujeita a alterações. Para casos concretos, procure o órgão ambiental, a Emater/RS ou profissional habilitado.')
    restrictions={
      'SUST-LEG-003':'As regras de recomposição em área rural consolidada variam conforme os módulos fiscais; esta resposta não substitui a análise do caso concreto.',
      'SUST-LEG-007':'A regulamentação está em implantação; confirme os detalhes operacionais nas fontes oficiais atuais.',
      'SUST-LEG-010':'Prazos e procedimentos de tríplice lavagem não foram confirmados neste acervo. Siga o rótulo e a orientação da revenda.',
      'SUST-LEG-014':'Esta resposta não detalha a produção de bioinsumos na propriedade.',
      'SUST-LEG-015':'Esta resposta não cobre a Lei de Sementes nem royalties de biotecnologia.',
      'SUST-LEG-017':'A dispensa de outorga para usos insignificantes depende do órgão gestor estadual.',
      'MERC-PS-003':'Confirme as taxas aplicáveis no Manual de Crédito Rural do Banco Central ou com o agente financeiro.',
      'MERC-PS-006':'Outras linhas do Pronaf têm taxas diferentes. Confirme as condições no banco ou na cooperativa de crédito.',
      'MERC-PS-009':'Consulte o banco ou a cooperativa de crédito para uma simulação adequada ao seu caso.',
      'GER-013':'O slogan registrado se refere a 2024 e 2026; não confirma o slogan de outra edição.',
      'GER-005':'A contagem é uma referência de outubro de 2026; a numeração de 2028 permanece não confirmada.',
      'FAQ-GER-004':'O preço de 2026 não é o preço de 2028.',
    }
    if x['id'] in restrictions:notes.append(restrictions[x['id']])
    if x['id'].startswith('RS-IBGE-RI-'):notes.append('Regiões geográficas do IBGE (divisão de 2017); não equivalem aos COREDEs do Governo do RS. Os totais são somas dos dados municipais.')
    if any('/p/last' in s['url'] for s in x['sources']):notes.append('A fonte usa um endereço de atualização contínua e pode mostrar outro período. O número desta resposta corresponde somente à referência indicada.')
    return notes

for base,document,outname in [('fenasoja',f,'fenasoja-kb.json'),('expandida',e,'kb-expandida.json')]:
    revised=[]
    for original in document['entries']:
        x=json.loads(json.dumps(original)); ident=x['id']; answer=x['answer']
        m=re.fullmatch(r'SEM FONTE CONFIRMADA\. Resposta do bot: "(.*)"',answer,re.S)
        if m:answer=m[1]
        if ident in replacements:answer=replacements[ident]
        answer=answer.replace('volume de negócios de acima de','volume de negócios acima de').replace('(> 60%)','(mais de 60%)')
        if ident=='F28-004':answer=answer.replace('Contato pelo site (Quero ser expositor) ou fenasoja@fenasoja.com.br.','Contato pela página oficial "Quero ser expositor", indicada nas fontes.')
        if ident=='F28-007':answer=answer.replace('Acompanhe o portal fenasoja.com.br.','Acompanhe o portal oficial da Fenasoja.')
        if ident=='TEC-WK-0041':answer=answer.replace('Pix (pronuncia-se pikz) é','O sistema de pagamentos instantâneos Pix, pronunciado "pikz", é')
        if ident=='HIS-012':answer=answer.replace('2028 (próxima)','2028 (anunciada)')
        if x.get('status')=='dinâmico' and ident not in replacements:
            answer=re.sub(r'O bot deve consultar a fonte ao vivo e citar a data\.|Consultar ao vivo e informar a data\.|Consultar ao vivo\.|Consultar ao vivo e informar o mês de referência\.', 'Consulte a fonte indicada e confira o período de referência.',answer)
            answer=answer.replace('O bot não deve informar valor fixo; deve consultar fonte ao vivo e citar data e horário. Para conceitos de bolsa, ver as entradas sobre mercado futuro e bushel.','Consulte uma fonte de cotações atualizada e confira a data, o horário e o mercado de referência.')
            answer=answer.replace('O bot deve consultar ao vivo e citar a data;','Consulte a fonte indicada e confira a data;')
            answer=answer.replace('O bot deve consultar o boletim mais recente ao vivo e citar o número do levantamento e a data.','Consulte o boletim mais recente e confira o número do levantamento e a data.')
        answer=answer.replace('\u00a0',' ').replace('\u200b','').replace('\u200c','').replace('\u200d','')
        record(x,'answer',original['answer'],answer,'Redação pública revisada; preserva os fatos, números, ressalvas e fontes. Remove invólucro editorial, contatos e links textuais ou caracteres incompatíveis.');x['answer']=answer
        kind=x.get('kind','fato').replace('orientação','orientacao');record(x,'kind',original.get('kind'),kind,'Normalização de enum; Fenasoja sem kind recebe fato.')
        status=x['status'].replace('dinâmico','dinamico');record(x,'status',original['status'],status,'Normalização de enum sem alterar condição factual.')
        relevance=x.get('relevancia_fenasoja','alta').replace('média','media');record(x,'relevance',original.get('relevancia_fenasoja'),relevance,'alta/media/baixa preservam relevância editorial; sem tradução para score.')
        sources=[]
        for source in x['sources']:
            s=dict(source);label=s['title']
            if 'conteúdo das edições lido também via' in label:label='Fenasoja · História e Edições Anteriores'
            label=re.sub(r'\([^)]*(?:https?://|ftp\.fenasoja)[^)]*\)','',label).strip()
            s['label']=label;record(x,'sources.label',source['title'],label,'Rótulo público limpo; título original e demais metadados preservados.');sources.append(s)
        year=x.get('entities',{}).get('edition_year') or contexts.get(ident)
        number=x.get('entities',{}).get('edition_number')
        if year and not number and year in edition_by_year and edition_by_year[year]['number_confirmed']:number=edition_by_year[year]['number']
        scope='edition' if year else 'general'
        subject='fenasoja' if base=='fenasoja' or ident.startswith('FAQ-') or ident=='FEIRAS-GER-003' else {'AGRO':'agriculture','AGTECH':'agriculture','TEC':'technology','MERC':'markets','SUST':'legislation','RS':'regional','FEIRAS':'other_fairs'}[x['area']]
        period=None;valid_from=None;valid_until=None
        if 'vigência jul/2025' in x.get('interpretation_notes',''):scope='period';subject='plano_safra';period='2025/2026';valid_from='2025-07-01';valid_until='2026-06-30'
        elif status=='dinamico':scope='dynamic'
        elif kind=='dado' and not year and x.get('as_of'):scope='period';period=x['as_of']
        if year and year in edition_by_year:valid_until=edition_by_year[year]['end']
        if ident in ['GER-005','HIS-009','HIS-010','HIS-012','REC-001','REC-002','REC-004','REC-005','REC-006','REC-007']:
            scope='period';period='2026-10-17';valid_until='2026-10-17'
        if ident=='GER-006':scope='edition';year=2020
        # Full source snapshot is retained in raw; these metadata are never executable instructions.
        metadata={k:v for k,v in original.items() if k not in ['id','canonical_question','variants','answer','sources','tags','related_ids','gaps']}
        context=dict(scope=scope,subject=subject,reference_period=period,valid_from=valid_from,valid_until=valid_until,edition_required=bool(year))
        record(x,'edition_year',original.get('entities',{}).get('edition_year'),year,'Edição extraída do conteúdo e contexto explícitos, nunca apenas do prefixo do ID.')
        revised.append(dict(id=ident,kb=base,area='FENASOJA' if base=='fenasoja' else x['area'],area_name='Fenasoja institucional' if base=='fenasoja' else x['area_nome'],subcategory=x.get('category',x.get('subcategoria')),canonical_question=x['canonical_question'],variants=x['variants'],answer=answer,kind=kind,status=status,as_of=x.get('as_of'),edition_number=number,edition_year=year,dynamic_instructions=None,citation_template=x.get('citation_template'),sources=sources,tags=x.get('tags',[]),related_ids=x.get('related_ids',[]),fenasoja_links=x.get('fenasoja_kb_links',[]),gaps=x.get('gaps',[]),relevance=relevance,priority=1 if base=='fenasoja' else 2,kb_version=VERSION,context=context,public_notes=reviewed_notes(original),query_policy={},editorial_metadata=metadata,provenance=dict(source_file='fenasoja-kb.json' if base=='fenasoja' else 'kb-expandida.json',source_sha256=sha((RAW / ('fenasoja-kb.json' if base=='fenasoja' else 'kb-expandida.json')).read_bytes()),source_entry_id=ident,revision=VERSION,managed_by='fenasoja-kb-seed')))
    write(outname,dict(meta=dict(version=VERSION,kb=base,expected_entries=len(revised),expected_questions=sum(1+len(x['variants']) for x in revised)),entries=revised))
write('curation-log.json',dict(version=VERSION,changes=log))
write('expected-counts.json',dict(version=VERSION,initial_baseline={'fenasoja':{'entries':372,'questions':1245},'expandida':{'entries':2414,'questions':10889}},expected={'fenasoja':{'entries':372,'questions':1245},'expandida':{'entries':2414,'questions':10889}},retired_ids=[],change_reason='Initial complete import; original counts are immutable baseline.'))
print(json.dumps({'entries':2786,'questions':12134,'editorial_changes':len(log),'editions':len(editions)},ensure_ascii=False))
