import json,math
w=json.load(open('artifacts/territory/osm-ways.json'))
a=(-54.4777125,-27.8434439);b=(-54.4756499,-27.8467157);c=(-54.4800196,-27.8446064)
u=(b[0]-a[0],b[1]-a[1]);v=(c[0]-a[0],c[1]-a[1]);det=u[0]*v[1]-u[1]*v[0]
def tr(p):
 q=(p[0]-a[0],p[1]-a[1]);s=(q[0]*v[1]-q[1]*v[0])/det;t=(u[0]*q[1]-u[1]*q[0])/det
 sx=3964+s*(1110-3964);sz=4200+s*(4185-4200)+t*(2440-4200)
 return [round((sx-3350)*120/5500,4),round((sz-2975)*120/5500,4)]
for x in w:
 x['local']=[tr(p) for p in x['points']]
 if x['tags'].get('ref') or x['id'] in ['571136681','571136682','268884167']: print(x['id'],x['tags'].get('ref',x['tags'].get('name')),x['local'][0],x['local'][-1])
json.dump(w,open('artifacts/territory/osm-aligned.json','w'),indent=2)
from PIL import Image,ImageDraw
im=Image.new('RGB',(1400,1200),'#eeeade');d=ImageDraw.Draw(im)
def pixel(p):return ((p[0]+110)*4,(p[1]+170)*4)
for x in w:
 pts=[pixel(v) for v in x['local']];t=x['tags']
 if t.get('leisure')=='park':d.polygon(pts,fill='#aed194')
for x in w:
 pts=[pixel(v) for v in x['local']];t=x['tags']
 if 'highway' in t and len(pts)>1:d.line(pts,fill='#bc5445' if t.get('ref') else '#707070',width=4 if t.get('ref') else 2)
 if t.get('junction') or t.get('ref'):d.text(pts[len(pts)//2],x['id'],fill='black')
d.rectangle([pixel([-60,-45]),pixel([60,45])],outline='blue',width=2)
for text,p in [('A3',[13.4,26.7]),('A2',[-48.8,26.4]),('Arena',[39.1,-1.4]),('A5',[56.5,15.3])]:d.text(pixel(p),text,fill='black')
im.save('artifacts/territory/osm-aligned.png')
