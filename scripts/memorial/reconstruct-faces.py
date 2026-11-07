"""Clean museum faces: deterministic typesetting plus ORIGINAL historical graphics.

Never asks an image model to reconstruct lettering. Reviewed inscription data is the
only source of names. Incomplete characters stay explicitly marked. Original JPEGs
and perspective-corrected photographic faces remain available for comparison.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
import json
import numpy as np
import hashlib
import sys

ROOT = Path(__file__).resolve().parents[2]
MEDIA = ROOT / 'public/memorial-voluntariado'
DATA = ROOT / 'src/features/memorial'
GOLD = (221, 184, 101)
INK = (17, 21, 20)
FONTS = {'sans': 'C:/Windows/Fonts/arialbd.ttf', 'narrow': 'C:/Windows/Fonts/arialnb.ttf', 'mono': 'C:/Windows/Fonts/consolab.ttf', 'italic': 'C:/Windows/Fonts/arialbi.ttf', 'serif': 'C:/Windows/Fonts/timesbi.ttf'}


def font(kind, size):
    path = FONTS[kind]
    if not Path(path).exists(): path = FONTS['sans']
    return ImageFont.truetype(path, max(8, round(size)))


def fit_text(draw, text, kind, size, width):
    ft = font(kind, size)
    while draw.textlength(text, font=ft) > width and size > 9:
        size -= .5
        ft = font(kind, size)
    return ft


def stencil(source, bounds, size, color=GOLD, shadow_gold=False):
    """Extract the geometry of original gold marks, excluding neutral glare.
    The mask is derived from photographed chroma; missing strokes are never invented.
    """
    w,h = source.size
    crop = source.crop(tuple(round(v*(w if i%2==0 else h)) for i,v in enumerate(bounds)))
    rgb = np.array(crop.convert('RGB')).astype(float)
    saturation = rgb.max(axis=2)-rgb.min(axis=2)
    # Gold is red/green dominant, blue deficient. Neutral photographer reflections do not pass.
    alpha = np.clip((rgb[:,:,0]-rgb[:,:,2]-14)*10,0,255)
    if shadow_gold:
        alpha *= (saturation > 22) & (rgb[:,:,0] > 85) & (rgb[:,:,1] > 65)
    else:
        alpha *= (saturation > 30) & (rgb[:,:,0] > 155) & (rgb[:,:,1] > 110)
    mask = Image.fromarray(alpha.astype('uint8')).filter(ImageFilter.GaussianBlur(.32)).resize(size,Image.Resampling.LANCZOS)
    layer = Image.new('RGB', size, color)
    return layer,mask


def clean_plate(record, transcript, source):
    height = 2200
    width = round(height * source.width/source.height)
    rng = np.random.default_rng(record['year'])
    mineral = rng.normal(0, .65, (height,width,1))
    base = np.clip(np.array(INK) + mineral,0,255).astype('uint8')
    face = Image.fromarray(base)
    draw = ImageDraw.Draw(face)
    render = record.get('art', {})
    old = record['model']['profile'] == 'matte'
    names_first = render.get('namesFirst', record['year'] in [2000,2002,2008,2010,2012,2014,2016,2018])
    kind = render.get('font', 'mono' if record['year']==2004 else 'sans')

    def original_region(bounds, gold_only=False, black_ink=False, clip_polygon=None, shadow_gold=False):
        x0,y0,x1,y1 = bounds
        target=(round((x1-x0)*width),round((y1-y0)*height))
        position=(round(x0*width),round(y0*height))
        if black_ink:
            crop=source.crop((round(x0*source.width),round(y0*source.height),round(x1*source.width),round(y1*source.height))).convert('RGB')
            values=np.array(crop).astype(float)
            # Original dark lettering only. Brass scratches/highlights do not enter the clean face.
            darkness=np.clip((115-values.max(axis=2))*5,0,255).astype('uint8')
            mask=Image.fromarray(darkness).filter(ImageFilter.GaussianBlur(.25)).resize(target,Image.Resampling.LANCZOS)
            face.paste(Image.new('RGB',target,INK),position,mask)
        elif gold_only:
            layer,mask=stencil(source,bounds,target,shadow_gold=shadow_gold or record['year']==2018)
            if clip_polygon:
                clipping=Image.new('L',target,0)
                ImageDraw.Draw(clipping).polygon([((x-x0)*width,(y-y0)*height) for x,y in clip_polygon],fill=255)
                mask=ImageChops.multiply(mask,clipping)
            face.paste(layer,position,mask)
        else:
            crop=source.crop((round(x0*source.width),round(y0*source.height),round(x1*source.width),round(y1*source.height)))
            face.paste(crop.resize(target,Image.Resampling.LANCZOS),position)

    if old:
        # The modern matte family shares the photographed header hierarchy, never a fictional logo.
        title=f"{record['edition']}ª FENASOJA"
        header_y = .05 if record['year'] >= 2020 else .105
        draw.text((width*.11,height*header_y),title,font=fit_text(draw,title,'sans',width*.043,width*.44),fill=GOLD,anchor='lm')
        period=record.get('engravedPeriod','')
        if 'conferir' not in period.lower():
            words=period.split(); lines=render.get('periodLines',[]); line=''
            if lines: words=[]
            for word in words:
                candidate=(line+' '+word).strip()
                if len(candidate)>22 and line: lines.append(line);line=word
                else: line=candidate
            if line:lines.append(line)
            for i,text in enumerate(lines):
                draw.text((width*.56,height*(header_y-.013+i*.024)),text,font=fit_text(draw,text,'sans',width*.027,width*.39),fill=GOLD,anchor='lm')
    else:
        # The gilded perimeter and historical top graphic are copied from each piece, not generalized.
        draw.rectangle((width*.006,height*.005,width*.994,height*.995),outline=GOLD,width=max(2,round(width*.005)))
        if record['year'] in [1998,2000,2002]:
            # Recompose the photographed stepped brass frame, without photographic chips or glare.
            draw.rectangle((0,0,width,height),fill=GOLD)
            inner=[(.13,.035),(.87,.035),(.87,.055),(.92,.055),(.92,.083),(.96,.083),(.96,.92),(.93,.92),(.93,.95),(.88,.95),(.88,.975),(.12,.975),(.12,.95),(.07,.95),(.07,.92),(.04,.92),(.04,.083),(.08,.083),(.08,.055),(.13,.055)]
            draw.polygon([(x*width,y*height) for x,y in inner],fill=INK)
            for x in [.058,.942]:draw.line((width*x,height*.125,width*x,height*.905),fill=GOLD,width=max(2,round(width*.009)))
            for y in [.045,.962]:draw.line((width*.17,height*y,width*.83,height*y),fill=GOLD,width=max(2,round(height*.003)))
            for x in [.025,.975]:
                for y in [.025,.975]:
                    radius=width*.009
                    draw.ellipse((width*x-radius,height*y-radius,width*x+radius,height*y+radius),fill=(183,145,67),outline=(244,212,136),width=2)
                    draw.line((width*x-radius*.5,height*y,width*x+radius*.5,height*y),fill=INK,width=2)
            if render.get('headerAsset'):
                asset=Image.open(MEDIA/render['headerAsset']).convert('RGBA');x0,y0,x1,y1=render['headerAssetBounds'];asset=asset.resize((round((x1-x0)*width),round((y1-y0)*height)),Image.Resampling.LANCZOS);face.paste(asset,(round(x0*width),round(y0*height)),asset)
            else:original_region(render.get('headerCrop',[.05,.02,.95,.22]),True)
            if record['year']==1998:
                original_region([.58,.055,.91,.19],True,shadow_gold=True)
            if record['year']==2000:
                period='01 A 09 DE ABRIL DE 2000   SANTA ROSA-RS   BRASIL'
                draw.text((width*.5,height*.231),period,font=fit_text(draw,period,'sans',width*.023,width*.82),fill=GOLD,anchor='mm')
                draw.line((width*.09,height*.243,width*.94,height*.243),fill=GOLD,width=3)
            if record['year']==2002 and render.get('illustrationAsset'):
                asset=Image.open(MEDIA/render['illustrationAsset']).convert('RGBA');x0,y0,x1,y1=render['illustrationAssetBounds'];asset=asset.resize((round((x1-x0)*width),round((y1-y0)*height)),Image.Resampling.LANCZOS);face.paste(asset,(round(x0*width),round(y0*height)),asset)
        elif record['year']==2004:
            original_region([.215,.043,.79,.176])
            for x in [.405,.455,.505,.555]:
                draw.rectangle((width*x,0,width*(x+.022),height*.021),fill=GOLD)
                draw.rectangle((width*x,height*.979,width*(x+.022),height),fill=GOLD)
            period=record.get('engravedPeriod','')
            draw.text((width*.5,height*.224),period,font=font('mono',width*.037),fill=GOLD,anchor='mm')
        elif record['year']==2006:
            draw.rectangle((0,0,width*.22,height),fill=(203,169,82))
            if render.get('posterAsset'):
                asset=Image.open(MEDIA/render['posterAsset']).convert('RGBA');x0,y0,x1,y1=render['posterAssetBounds'];asset=asset.resize((round((x1-x0)*width),round((y1-y0)*height)),Image.Resampling.LANCZOS);face.paste(asset,(round(x0*width),round(y0*height)),asset)
            else:original_region(render['posterCrop'])
            draw.text((width*.61,height*.025),record['engravedPeriod'],font=fit_text(draw,record['engravedPeriod'],'mono',width*.024,width*.70),fill=GOLD,anchor='mm')
            for x in [.035,.06,.085,.11,.135]:
                draw.line((width*x,height*.34,width*x,height*.974),fill=INK,width=max(2,round(width*.004)))
        elif record['year']==2018:
            original_region([0,0,1,.10],True)
            original_region([0,.94,1,1],True)
            original_region([.04,.105,.94,.22],True)
        else:
            # Header is a deterministic brass silhouette. Campaign artwork remains an exact original crop.
            header_bottom=render.get('headerBottom',.20)
            curve=[(0,0),(width,0),(width,int(height*header_bottom)),(int(width*.75),int(height*(header_bottom+.008))),(int(width*.4),int(height*(header_bottom+.035))),(0,int(height*(header_bottom+.08)))]
            draw.polygon(curve,fill=(203,169,82))
            original_region(render.get('posterCrop',[.025,.035,.285,.285]))
            header = render.get('headerCrop',[.34,.015,.94,.105])
            # Retain original black lettering/brand over the original gold area only.
            if render.get('campaignLines'):
                for line in render['campaignLines']:
                    text=line['text'];position=(width*line.get('x',.65),height*line['y']);ft=fit_text(draw,text,line.get('font','italic'),width*line['size'],width*line.get('width',.62));draw.text(position,text,font=ft,fill=INK,anchor='mm')
            else:original_region(header,black_ink=True)
            for x in [.105,.128,.151,.174,.197]:
                draw.line([(width*x,height*.27),(width*x,height*.985)],fill=GOLD,width=max(2,round(width*.003)))

    # Position text and section labels using the reviewed photographic row regions.
    sections=[section for section in transcript['sections'] if section['title'].lower() not in ['crédito da peça','crédito lateral','crédito']]
    for section_index, section in enumerate(sections):
        if not section['title']:
            for line in section['lines']:
                if line['status']=='verified':
                    text=line['name']
                    draw.text((width*.5,height*.985),text,font=fit_text(draw,text,'sans',width*.016,width*.90),fill=GOLD,anchor='mm')
            continue
        # Separate transcribed people can share a printed row (1966 vice-presidents).
        # Compose that row once; preserve its original conjunction rather than overlapping glyphs.
        lines=[]
        for item in section['lines']:
            line=dict(item)
            line['name']=line['name'] if line['status']=='verified' else 'Trecho ilegível na fotografia'
            line['status']='verified'
            if lines and abs(lines[-1]['sourceRegion'][1]-line['sourceRegion'][1]) < .002 and lines[-1]['role']==line['role']:
                lines[-1]['name'] += ' E '+line['name']
            else: lines.append(line)
        if not lines:continue
        first_y=lines[0]['sourceRegion'][1]
        label_y=max(.03,first_y-.022)
        label=section['title']
        label_size=width*(.029 if old else .025)
        label_font=fit_text(draw,label,'sans',label_size,width*.67)
        label_width=draw.textlength(label,font=label_font)+width*.06
        label_height=height*.024
        cx=width*(.52 if old else .60 if record['year'] in [2006,2008,2010,2012,2014,2016] else .5)
        if record['year']==2004:
            # Four horizontal gold rules on both sides, as photographed in the 2004 piece.
            for offset in [-.017,-.007,.003,.013]:
                y=height*(label_y+offset)
                draw.line((width*.05,y,width*.34,y),fill=GOLD,width=3)
                draw.line((width*.70,y,width*.95,y),fill=GOLD,width=3)
            draw.text((width*.52,height*label_y),label,font=fit_text(draw,label,'mono',width*.034,width*.35),fill=GOLD,anchor='mm')
        elif record['year'] in [1998,2000,2002,2008,2010,2012]:
            draw.text((cx,height*label_y),label,font=label_font,fill=GOLD,anchor='mm')
            if record['year'] in [1998,2000]:
                draw.line((cx-label_width/2,height*label_y+label_height*.6,cx+label_width/2,height*label_y+label_height*.6),fill=GOLD,width=3)
        else:
            draw.rounded_rectangle((cx-label_width/2,height*label_y-label_height/2,cx+label_width/2,height*label_y+label_height/2),radius=label_height/2 if old or record['year']==2018 else 2,fill=GOLD)
            draw.text((cx,height*label_y),label,font=label_font,fill=INK,anchor='mm')

        if names_first:
            divider=width*(.65 if record['year'] in [2006,2008,2010,2012,2014,2016] else .50)
            left_start=width*(.24 if record['year'] in [2006,2008,2010,2012,2014,2016] else .10)
            right_end=width*.94
        else:
            divider=width*.53;left_start=width*.025;right_end=width*.96
        # Keep a uniform font within a section and avoid overlap/truncation.
        size=min(width*.023,height*.013)
        if record['year']==2004:size=width*.029
        if old:size=width*.024
        if len(lines)>26:size=min(size,width*.020)
        for line in lines:
            left=line['name'] if names_first else line['role']
            right=line['role'] if names_first else line['name']
            for text,available in [(left,divider-left_start-width*.014),(right,right_end-divider-width*.014)]:
                for fragment in text.split('\n'):
                    if 'Trecho ilegível' in fragment:continue
                    while draw.textlength(fragment,font=font(kind,size))>available and size>9:size-=.25
        ft=font(kind,size)
        for index,line in enumerate(lines):
            region=line['sourceRegion'];y=height*(region[1]+region[3]*.50)
            # Repeated/shared role groups remain one centered inscription on the face.
            shared=[i for i,other in enumerate(lines) if other['role']==line['role']]
            display_role=line['role']=='Trecho ilegível na fotografia' or len(shared)<2 or index==shared[len(shared)//2]
            role=line['role'] if display_role else ''
            name=line['name'] if line['status']=='verified' else 'Trecho ilegível na fotografia'
            left,right=(name,role) if names_first else (role,name)
            left_parts=left.split('\n');right_parts=right.split('\n')
            line_height=height*.017
            for i,text in enumerate(left_parts):
                row_font=fit_text(draw,text,kind,size,divider-left_start-width*.014)
                draw.text((divider-width*.014,y+(i-(len(left_parts)-1)/2)*line_height),text,font=row_font,fill=GOLD,anchor='rm')
            for i,text in enumerate(right_parts):
                row_font=fit_text(draw,text,kind,size,right_end-divider-width*.014)
                draw.text((divider+width*.014,y+(i-(len(right_parts)-1)/2)*line_height),text,font=row_font,fill=GOLD,anchor='lm')
    return face


def main():
    records=json.loads((DATA/'catalog.json').read_text(encoding='utf-8'))
    assets=json.loads((DATA/'assets.json').read_text(encoding='utf-8'))
    (MEDIA/'art').mkdir(exist_ok=True)
    for record in records:
        if record['kind']=='epilogue':continue
        if len(sys.argv)>1 and record['id'] not in sys.argv[1:]:continue
        path=DATA/'transcriptions'/record['transcriptionFile']
        if not path.exists():continue
        transcript=json.loads(path.read_text(encoding='utf-8-sig'))
        source=Image.open(MEDIA/'faces'/f"{record['id']}.webp").convert('RGB')
        face=clean_plate(record,transcript,source)
        target=MEDIA/'art'/f"{record['id']}.webp"
        face.save(target,quality=94,method=6)
        for bound,suffix,quality in [(420,'',88),(240,'-240',86)]:
            thumb=face.copy();thumb.thumbnail((bound,round(bound*4/3)))
            thumb.save(MEDIA/'thumbnails'/f"{record['id']}{suffix}.webp",quality=quality,method=6)
        assets[record['id']].update({'art':True,'artWidth':face.width,'artHeight':face.height,'artBytes':target.stat().st_size,'artSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'editorialStatus':transcript['status'],'thumbnailBytes':(MEDIA/'thumbnails'/f"{record['id']}.webp").stat().st_size})
        print(f"{record['id']}: {sum(len(s['lines']) for s in transcript['sections'])} reviewed rows, {target.stat().st_size} bytes")
    (DATA/'assets.json').write_text(json.dumps(assets,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':main()
