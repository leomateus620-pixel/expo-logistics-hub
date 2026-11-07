import { describe, expect, it } from 'vitest';
import { galleryLayout, boundView, zoomAt, PointerGesture } from './surfaceMath';
import { timelinePath } from './timelinePath';
import { fitPlate, initialPose, zoomPose, boundPose, textureLimit, textureTarget } from './inspectionMath';

describe('Bounded gallery geometry', () => {
  for (const [width,height] of [[1314,609],[1388,741],[1868,921]]) {
    it(`fits every edition and epilogue inside ${width}×${height}`, () => {
      const viewport={width,height}, layout=galleryLayout(viewport);
      expect(layout.columns).toBeGreaterThanOrEqual(6);
      const view=boundView({x:0,y:0,scale:layout.initial},viewport,layout);
      for (const cell of layout.cells) {
        expect(cell.x*view.scale+view.x).toBeGreaterThanOrEqual(0);
        expect((cell.x+layout.cellWidth)*view.scale+view.x).toBeLessThanOrEqual(width+.001);
        expect((cell.y+layout.cellHeight)*view.scale+view.y).toBeLessThanOrEqual(height+.001);
      }
      expect(Math.hypot(layout.cells[25].x-layout.cells[24].x,layout.cells[25].y-layout.cells[24].y)).toBeLessThan(200);
    });
  }
  it('does not let repeated resizes or a transformed SVG feed back into layout height', () => {
    const before=galleryLayout({width:1314,height:609});
    for (let i=0;i<100;i++) {
      galleryLayout({width:374,height:685});
      const next=galleryLayout({width:1314,height:609});
      expect(next).toEqual(before);
      const points=next.cells.map(cell=>({x:cell.x+82,y:cell.y+172}));
      const path=timelinePath(points,next.width,next.columns);
      expect(path).not.toMatch(/NaN|Infinity/);
      expect(Math.max(...points.map(p=>p.y))).toBeLessThan(next.height);
    }
  });
  it('shows multiple mobile editions, and never pans past either content edge', () => {
    for(const width of [344,374,414,828]) {
      const viewport={width,height:width>600?259:640}, layout=galleryLayout(viewport);
      expect(layout.columns).toBeGreaterThanOrEqual(2);
      expect(layout.initial*layout.cellWidth).toBeGreaterThan(90);
      const far=boundView({x:-100000,y:-100000,scale:layout.initial},viewport,layout);
      expect(far.x+layout.width*far.scale).toBeGreaterThanOrEqual(viewport.width-.001);
      expect(far.y+layout.height*far.scale).toBeGreaterThanOrEqual(viewport.height-.001);
      const start=boundView({x:100000,y:100000,scale:layout.initial},viewport,layout);
      expect(start.y).toBe(0);
    }
  });
  it('preserves the content point below the zoom anchor, including at the scale limit', () => {
    const before={scale:2,x:-100,y:-200}, anchor={x:150,y:300};
    const next=zoomAt(before,5,anchor,.5,4);
    expect(next.scale).toBe(4);
    expect((anchor.x-next.x)/next.scale).toBe((anchor.x-before.x)/before.scale);
    expect((anchor.y-next.y)/next.scale).toBe((anchor.y-before.y)/before.scale);
  });
});
describe('Real pointer transitions', () => {
  it('keeps a tap actionable, suppresses a drag and rebases 1→2→1 without jumps', () => {
    const gesture=new PointerGesture();
    gesture.down({id:1,x:100,y:100});
    expect(gesture.move({id:1,x:102,y:101})).toBeUndefined();
    expect(gesture.moved).toBe(false);
    expect(gesture.move({id:1,x:112,y:101})?.dx).toBe(10);
    gesture.down({id:2,x:212,y:101});
    const pinch=gesture.move({id:2,x:232,y:101})!;
    expect(pinch.factor).toBeCloseTo(1.2); expect(pinch.dx).toBe(10); expect(pinch.pan).toBe(true);
    gesture.up(2);
    const continued=gesture.move({id:1,x:114,y:104})!;
    expect(continued).toMatchObject({dx:2,dy:3,factor:1,pan:false});
    gesture.up(1); expect(gesture.moved).toBe(true);
    gesture.down({id:3,x:600,y:500}); expect(gesture.moved).toBe(false);
    gesture.cancel(); expect(gesture.move({id:3,x:0,y:0})).toBeUndefined();
  });
  it('keeps a remaining finger consistent after capture loss/cancellation', () => {
    const gesture=new PointerGesture();
    gesture.down({id:1,x:10,y:10}); gesture.down({id:2,x:30,y:10});
    gesture.up(1);
    expect(gesture.move({id:2,x:35,y:10})).toMatchObject({dx:5,dy:0,factor:1});
    gesture.cancel(); expect(gesture.points.size).toBe(0);
  });
});
describe('Inspection fit and texture budgets', () => {
  it('fits tall and landscape plates without distortion and anchors zoom', () => {
    const viewport={width:374,height:650};
    for(const aspect of [.5,.72,1.8]) {
      const fit=fitPlate(viewport,aspect);
      expect(fit.width/fit.height).toBeCloseTo(aspect);
      expect(fit.width).toBeLessThan(viewport.width); expect(fit.height).toBeLessThan(viewport.height);
    }
    const pose=zoomPose(initialPose(),2,{x:187,y:325},viewport,.72);
    expect(pose).toMatchObject({scale:2,x:0,y:0});
    expect(boundPose({...pose,x:1e6,y:-1e6},viewport,.72).x).toBeLessThan(500);
  });
  it('promotes above the old 1024/1536 ceiling within source, GPU and memory limits', () => {
    expect(textureTarget(800,2,2,2200)).toBe(2200);
    expect(textureLimit(1506,2200,4096,4)).toBe(2143);
    expect(textureLimit(1506,2200,1024,8)).toBe(1024);
    expect(textureLimit(1506,2200,8192,8)).toBe(2200);
  });
});
