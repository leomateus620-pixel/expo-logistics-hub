"""Build source/clean comparison inputs, editorial inventory and media accounting."""
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw,ImageFont
import json,hashlib

ROOT=Path(__file__).resolve().parents[2]
MEDIA=ROOT/'public/memorial-voluntariado'
DATA=ROOT/'src/features/memorial'
OUT=ROOT/'docs/memorial/evidence/pieces'
OUT.mkdir(parents=True,exist_ok=True)
records=json.loads((DATA/'catalog.json').read_text(encoding='utf-8'))
assets=json.loads((DATA/'assets.json').read_text(encoding='utf-8'))
inventory=[]
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',18)
for record in records:
    piece_id=record['id']
    for folder,suffix,key in [('faces','','faceSha256'),('thumbnails','','thumbnailSha256'),('thumbnails','-240','thumbnailSmallSha256')]:
        file=MEDIA/folder/f'{piece_id}{suffix}.webp'
        assets[piece_id][key]=hashlib.sha256(file.read_bytes()).hexdigest()
    if record['kind']=='epilogue':continue
    transcript=json.loads((DATA/'transcriptions'/record['transcriptionFile']).read_text(encoding='utf-8-sig'))
    sheet=Image.new('RGB',(1800,1320),'#e6e1d5')
    draw=ImageDraw.Draw(sheet)
    images=[ImageOps.exif_transpose(Image.open(MEDIA/'originals'/record['sourceFile'])),Image.open(MEDIA/'faces'/f'{piece_id}.webp'),Image.open(MEDIA/'art'/f'{piece_id}.webp')]
    for column,(im,label) in enumerate(zip(images,['JPEG de origem','Fotografia retificada','Face recomposta · texto conferido'])):
        x=column*600
        draw.text((x+18,16),label,font=font,fill='#27271d')
        im.thumbnail((560,1190));sheet.paste(im,(x+(600-im.width)//2,65))
    draw.text((18,1280),f"{record['year']} / {piece_id} / {record['sourceFile']} / revisão {transcript['status']}",font=font,fill='#27271d')
    sheet.save(OUT/f'{piece_id}.jpg',quality=90,optimize=True)
    pending=[{'section':s['title'],'role':l['role'],'name':l['name'],'note':l.get('note',''),'sourceRegion':l['sourceRegion']} for s in transcript['sections'] for l in s['lines'] if l['status']=='unreadable' or l.get('roleStatus')=='unreadable']
    inventory.append({'id':piece_id,'edition':record['edition'],'year':record['year'],'kind':record['kind'],'sourceFile':record['sourceFile'],'engravedPeriod':record['engravedPeriod'],'status':transcript['status'],'verifiedRecords':sum(l['status']=='verified' for s in transcript['sections'] for l in s['lines']),'unreadableNames':sum(l['status']=='unreadable' for s in transcript['sections'] for l in s['lines']),'pending':pending,'notes':transcript['notes'],'faceComparison':f'evidence/pieces/{piece_id}.jpg'})
(DATA/'assets.json').write_text(json.dumps(assets,indent=2)+'\n',encoding='utf-8')
(ROOT/'docs/memorial/inventory.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
media={folder:sum(p.stat().st_size for p in (MEDIA/folder).glob('*') if p.is_file()) for folder in ['originals','faces','art','artwork','thumbnails','environment']}
(ROOT/'docs/memorial/media-accounting.json').write_text(json.dumps({'files':media,'verifiedRecords':sum(r['verifiedRecords'] for r in inventory),'unreadableNames':sum(r['unreadableNames'] for r in inventory),'records':len(inventory)},indent=2)+'\n',encoding='utf-8')
for start in range(0,len(records),9):
    contact=Image.new('RGB',(1500,1890),'#e6e1d5')
    pen=ImageDraw.Draw(contact)
    for offset,record in enumerate(records[start:start+9]):
        column=offset%3;row=offset//3
        folder='faces' if record['kind']=='epilogue' else 'art'
        tile=Image.open(MEDIA/folder/f"{record['id']}.webp");tile.thumbnail((440,575))
        contact.paste(tile,(column*500+(500-tile.width)//2,row*630+30))
        pen.text((column*500+24,row*630+608),record['id'],font=font,fill='#27271d')
    contact.save(OUT.parent/f'clean-faces-contact-{start//9+1}.jpg',quality=91,optimize=True)
print(media)
print('verified',sum(r['verifiedRecords'] for r in inventory),'unreadable names',sum(r['unreadableNames'] for r in inventory))
