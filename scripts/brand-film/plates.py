"""Prepare the two separately art-directed editions of the portal film (Pillow)."""
from pathlib import Path
from math import ceil, cos, sin, pi
import argparse

from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter, ImageChops

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs/por-dentro-da-marca/fontes"
OLD = ROOT / "docs/portal-history/source/originais"
DEST = ROOT / "public/portal/brand-film"
PAPER = Image.open(SOURCE / "papel.webp").convert("RGB")
GREEN, CREAM, BLACK = "#173f31", "#f8ebcb", "#18372d"
YEARS = [1966,1974,1976,1979,1981,1984,1987,1990,1992,1994,1996,1998,2000,
         2002,2004,2006,2008,2010,2012,2014,2016,2018,2022,2024,2026]
LANCZOS = Image.Resampling.LANCZOS


def art(year):
    p = SOURCE / "primeiras-edicoes" / f"{year}.png"
    if not p.exists():
        p = next(OLD.glob(f"*-{year}.*"))
    return Image.open(p).convert("RGB")


def paper(size, dark=False):
    base = ImageOps.fit(PAPER, size, LANCZOS, centering=(0.12, 0.66))
    if dark:
        return ImageOps.colorize(ImageOps.grayscale(base), "#071f1d", "#265641")
    return base


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), round(size))


def label(im, xy, text, size, color=BLACK, face="Arial Narrow Bold.ttf"):
    ImageDraw.Draw(im).text(xy, text, font=font(face, size), fill=color, anchor="lt")


def rule(im, x, y, end, color=BLACK):
    ImageDraw.Draw(im).line((x, y, end, y), fill=color, width=2)


def mounted(im, photo, center, bounds, angle=0, edge=5):
    """Rotate a flat print as one object so each inscription keeps its proportions."""
    pic = ImageOps.contain(photo, tuple(map(int, bounds)), LANCZOS)
    pic = ImageOps.expand(pic.convert("RGB"), border=edge, fill=CREAM).convert("RGBA")
    pic = pic.rotate(angle, Image.Resampling.BICUBIC, expand=True)
    pos = tuple(round(x - y / 2) for x, y in zip(center, pic.size))
    shade = Image.new("RGBA", pic.size, (31, 28, 14))
    shade.putalpha(pic.getchannel("A").point(lambda a: a // 4).filter(ImageFilter.GaussianBlur(3)))
    im.paste(shade, (pos[0]+3, pos[1]+6), shade)
    im.paste(pic, pos, pic)


def crop_focal(im, size, focal, target=(.5,.5), zoom=1):
    w,h = size
    scale = max(w/im.width,h/im.height)*zoom
    sw,sh = w/scale,h/scale
    x = min(max(0, im.width*focal[0]-sw*target[0]),im.width-sw)
    y = min(max(0, im.height*focal[1]-sh*target[1]),im.height-sh)
    return im.resize(size,LANCZOS,(x,y,x+sw,y+sh))


def save(im, path, q=82):
    im.save(path, quality=q, method=6)


def origin(folder, w, h, tall):
    base = paper((w,h))
    # A broad enlargement of the actual green pod is printed on the studio mount.
    # Its crop and scale distinguish it from the complete documentary print.
    pigment = art(1966).crop((0,54,78,89))
    pigment = ImageOps.fit(pigment,(w,round(h*.32)),LANCZOS)
    grain = paper(pigment.size).convert("L")
    pigment = ImageChops.multiply(pigment, Image.merge("RGB",(grain,grain,grain)))
    base.paste(pigment,(0,round(h*.69)))
    d = ImageDraw.Draw(base)
    margin = round(w*.066)
    rule(base,margin,h*.13,w-margin)
    label(base,(margin,h*.148),"SANTA ROSA     /     RIO GRANDE DO SUL",w*(.024 if tall else .0134))
    label(base,(margin,h*.205),"1966",w*(.25 if tall else .185),GREEN,"Georgia.ttf")
    label(base,(margin,h*(.335 if tall else .505)),"4 a 11 de dezembro",w*(.040 if tall else .024),face="Georgia Italic.ttf")
    label(base,(margin,h*(.375 if tall else .566)),"PRIMEIRA FESTA NACIONAL DA SOJA",w*(.023 if tall else .014))
    portrait = Image.open(SOURCE/"willy.png")
    mounted(base, portrait, (w*(.734 if tall else .81),h*(.535 if tall else .488)),
            (w*(.31 if tall else .19), h*.34), 1.2, 7)
    chip_x, chip_y = w*(.58 if tall else .72), h*(.642 if tall else .665)
    chip_w, chip_h = w*(.35 if tall else .20), h*(.04 if tall else .065)
    d.rectangle((chip_x,chip_y,chip_x+chip_w,chip_y+chip_h),fill=CREAM)
    label(base,(chip_x+8,chip_y+6),"Willy Klaus",w*(.038 if tall else .020),face="Georgia Italic.ttf")
    save(base,folder/"origem.webp")
    # Independent ink plate, with a studio paper margin. At the roof contact it
    # spans the screen, then the same four corners settle beside the portrait.
    doc=art(1966).resize((312,468),LANCZOS)
    mat=paper((324,480)); mat.paste(doc,(6,6))
    save(mat,folder/"cartaz.webp",93)


def gallery(folder, w, h, years, name, tall, dark=False):
    im = paper((w,h),dark)
    color = CREAM if dark else GREEN
    margin = round(w*.065)
    rule(im,margin,h*.137,w-margin,color)
    label(im,(margin,h*.15),"FENASOJA     /     ARQUIVO DE EDIÇÕES",w*(.024 if tall else .014),color)
    label(im,(margin,h*.195),f"{years[0]} — {years[-1]}",w*(.102 if tall else .065),color,"Georgia.ttf")
    if len(years)>5:
        cols = 3 if tall else 5
    else:
        cols = 2 if tall else len(years)
    rows=ceil(len(years)/cols)
    left=margin
    usable=w-2*margin
    top=h*(.305 if tall else .35)
    bottom=.865
    if name=="mural-1":
        portrait=Image.open(SOURCE/"eugenio-pilz.jpg")
        if tall:
            mounted(im,portrait,(w*.76,h*.229),(w*.17,h*.12),2,3)
            label(im,(w*.68,h*.282),"Eugênio Pilz",w*.026,face="Georgia Italic.ttf")
            top=h*.345
        else:
            mounted(im,portrait,(w*.165,h*.565),(w*.18,h*.39),2.5,5)
            label(im,(w*.08,h*.8),"Eugênio Pilz",w*.029,face="Georgia Italic.ttf")
            label(im,(w*.08,h*.861),"PRESIDENTE  /  1976",w*.013)
            left=w*.299; usable=w*.638
    if name=="mural-3":
        volunteer=Image.open(SOURCE/"plantio-2025.webp")
        if tall:
            mounted(im,volunteer,(w*.5,h*.454),(w*.82,h*.29),1,5)
            label(im,(w*.10,h*.607),"Plantio coletivo, 2025",w*.040,face="Georgia Italic.ttf")
            cols=3; rows=1; top=h*.677; bottom=.875
        else:
            mounted(im,volunteer,(w*.28,h*.594),(w*.43,h*.49),1.4,6)
            label(im,(w*.085,h*.86),"Plantio coletivo, 2025",w*.025,face="Georgia Italic.ttf")
            left=w*.53; usable=w*.408; cols=3; rows=1
    cw=usable/cols
    ch=(h*bottom-top)/rows
    for i,year in enumerate(years):
        cx=left+(i%cols+.5)*cw
        cy=top+(i//cols+.39)*ch
        mounted(im,art(year),(cx,cy),(cw*.89,ch*.72), (1.3,-1.7,.4,1.6,-.7)[i%5],3)
        yr=str(year)
        f=font("Georgia Italic.ttf",w*(.029 if tall else .018))
        ImageDraw.Draw(im).text((cx,top+(i//cols+.84)*ch),yr,font=f,anchor="mm",fill=color)
    save(im,folder/f"{name}.webp",85)


def people(folder,w,h,tall):
    im=paper((w,h),True)
    pic=Image.open(SOURCE/"oficina-2018.jpg")
    if tall:
        photo=crop_focal(pic,(round(w*.90),round(h*.49)),(.52,.37),(.45,.40))
        x,y=round(.05*w),round(.30*h)
    else:
        photo=ImageOps.contain(pic,(round(w*.63),round(h*.76)),LANCZOS)
        x,y=round(w*.33),round(h*.13)
    border=ImageOps.expand(photo,border=7,fill=CREAM)
    im.paste(border,(x,y))
    margin=round(w*.065)
    label(im,(margin,h*(.13 if tall else .26)),"22ª FENASOJA",w*(.028 if tall else .016),CREAM)
    label(im,(margin,h*(.17 if tall else .345)),"2018",w*(.139 if tall else .112),CREAM,"Georgia.ttf")
    title=["Uma aula","no parque."] if not tall else ["Uma aula no parque."]
    for i,line in enumerate(title):
        label(im,(margin,h*((.813 if tall else .60)+i*.065)),line,w*(.06 if tall else .032),CREAM,"Georgia Italic.ttf")
    # Campaigns flanking the 2018 documentary scene continue the same wall.
    for i, year in enumerate((2016,2018)):
        center=(w*(.18+i*.29),h*.921) if tall else (w*(.108+i*.136),h*.823)
        mounted(im,art(year),center,(w*(.22 if tall else .11),h*.097),(-2,1)[i],2)
    save(im,folder/"oficina.webp",87)


def make(tall):
    folder=DEST/("retrato" if tall else "paisagem")
    folder.mkdir(parents=True,exist_ok=True)
    w,h = (720,1440) if tall else (1440,810)
    origin(folder,w,h,tall)
    gallery(folder,w,h,YEARS[1:11],"mural-1",tall)
    gallery(folder,w,h,YEARS[11:20],"mural-2",tall,True)
    gallery(folder,w,h,YEARS[22:],"mural-3",tall)
    people(folder,w,h,tall)
    a=Image.open(SOURCE/"DJI_0620.jpg")
    # Center the measured eave (1920, 1000), with different spatial context.
    park=crop_focal(a,(w,h),(.48,1000/2250),(.5,.47),1 if tall else 1.13)
    save(park,folder/"parque.webp",87)
    street=Image.open(SOURCE/"publico2.jpg")
    street=crop_focal(street,(w,h),(.528,.40),(.50,.40),1.02)
    save(street,folder/"rua.webp",84)
    # Trace the real nearer branch and the rectangular Rota do Chopp placard.
    # Keep their connection in the print. The vertical composition brings this
    # side detail back into the frame separately from the gate in the distance.
    source=Image.open(SOURCE/"publico2.jpg").convert("RGBA")
    points=[(18,350),(36,292),(52,239),(70,182),(86,139),(104,99),
            (126,67),(163,18),(177,0),(214,0),(194,24),(155,75),
            (140,97),(180,100),(196,76),(233,46),(283,10),(300,0),
            (324,0),(294,30),(271,48),(234,77),(205,113),(197,131),
            (205,205),(135,213),(120,168),(100,211),(82,263),(70,315),
            (65,350)]
    trace=Image.new("L",source.size)
    ImageDraw.Draw(trace).polygon([(round(x*source.width/900),round(y*source.width/900)) for x,y in points],fill=255)
    source.putalpha(trace)
    cut=source.crop(trace.getbbox())
    cut.thumbnail((round(w*(.30 if tall else .32)),round(h*.82)),LANCZOS)
    save(cut,folder/"margem.webp",86)
    if not tall:
        small=ImageOps.fit(park,(116,76),LANCZOS);save(small,ROOT/"src/components/portal/brand-film/lampejo.webp",66)


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--fonts",type=Path,default=Path("/System/Library/Fonts/Supplemental"))
    FONTS=parser.parse_args().fonts
    for portrait in (False,True):
        make(portrait)
    # The 1000 px ACISAP scan of the 1966 stamp gives a working pitch of
    # 3.3–3.5 px at 11–13 degrees in light areas. This plate is a new screen
    # made from the generated paper, separate from the documentary poster.
    tile=PAPER.convert("L").crop((1020,135,1212,327))
    fiber=tile.load()
    for y in range(tile.height):
        for x in range(tile.width):
            along=(x*cos(pi/15)+y*sin(pi/15))*2*pi/3.4
            across=(-x*sin(pi/15)+y*cos(pi/15))*2*pi/3.4
            fiber[x,y]=max(0,min(255,round(141+(fiber[x,y]-223)*1.5-78*max(0,cos(along)*cos(across)))))
    tile.save(DEST/"tinta.webp",lossless=True)
    original=Image.open(ROOT/"public/alvorada/fenasoja-symbol-official.png").convert("RGBA")
    # Align the opaque bounds of the master with the 144 px header export.
    alpha=original.crop((17,18,495,496)).getchannel("A")
    mask=Image.new("RGBA",alpha.size,"white"); mask.putalpha(alpha)
    mask.save(DEST/"simbolo.webp",lossless=True)
