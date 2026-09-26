"""Read-only extraction experiment. No generated geometry is area-fitted."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path('.codex-tmp/exporural-python').resolve()))
import cv2
import numpy as np
image = cv2.imread(str(Path.home() / 'Downloads/Fenasoja_So_Numeros_300dpi.png'))
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
_, binary = cv2.threshold(gray, 230, 255, cv2.THRESH_BINARY)
contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
candidates = [c for c in contours if 45000 < cv2.contourArea(c) < 1100000]
print('Candidates', len(candidates))
for c in sorted(candidates, key=lambda c: cv2.boundingRect(c)[1]):
    x,y,w,h = np.array(cv2.boundingRect(c))*1888/image.shape[1]
    if y > 300: print([round(v,1) for v in [x,y,w,h]], 'area', round(cv2.contourArea(c)*(1888/image.shape[1])**2))
np.savez_compressed('.codex-tmp/contours.npz', **{str(i):c for i,c in enumerate(candidates)})
