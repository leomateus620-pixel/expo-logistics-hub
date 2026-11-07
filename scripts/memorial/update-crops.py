"""Apply a reviewed crop patch and keep existing transcription locators associated.

python scripts/memorial/update-crops.py scripts/memorial/crop-refinements.json
Then run process-acervo.py for changed IDs and reconstruct-faces.py.
"""
from pathlib import Path
import json
import sys
import cv2
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
data_path=ROOT/'src/features/memorial/catalog.json'
records=json.loads(data_path.read_text(encoding='utf-8'))
assets=json.loads((ROOT/'src/features/memorial/assets.json').read_text(encoding='utf-8'))
patch=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
for record in records:
    if record['id'] not in patch:continue
    corners=patch[record['id']]
    if record['crop']==corners:continue
    pts=np.float32(corners)
    width=round((np.linalg.norm(pts[1]-pts[0])+np.linalg.norm(pts[2]-pts[3]))/2)
    height=round((np.linalg.norm(pts[3]-pts[0])+np.linalg.norm(pts[2]-pts[1]))/2)
    matrix=cv2.getPerspectiveTransform(pts,np.float32([[0,0],[width-1,0],[width-1,height-1],[0,height-1]]))
    old=assets[record['id']]
    transform=matrix@np.linalg.inv(np.array(old['homography']))
    transcription=ROOT/'src/features/memorial/transcriptions'/record['transcriptionFile']
    if transcription.exists():
        text=json.loads(transcription.read_text(encoding='utf-8-sig'))
        for section in text['sections']:
            for line in section['lines']:
                x,y,w,h=line['sourceRegion']
                points=np.float32([[[x*old['width'],y*old['height']],[(x+w)*old['width'],(y+h)*old['height']]]])
                mapped=cv2.perspectiveTransform(points,transform)[0]
                x0,y0=np.clip(mapped[0]/[width,height],0,1)
                x1,y1=np.clip(mapped[1]/[width,height],0,1)
                line['sourceRegion']=[round(float(x0),5),round(float(y0),5),round(float(max(.001,x1-x0)),5),round(float(max(.001,y1-y0)),5)]
        transcription.write_text(json.dumps(text,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    record['crop']=corners
data_path.write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
