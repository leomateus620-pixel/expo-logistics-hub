import { describe, expect, it } from 'vitest';
import { isPathClear, neighbors, panelViewPosition, pathForEdge, routeBetween, VENUE, VISIT_EDGES, VISIT_NODES, type VisitNode } from '@/features/soy-summit/venue-layout';

describe('Centro Cívico connected visit', () => {
  it('validates the complete swept route in both directions, including the ramps', () => {
    for (const edge of VISIT_EDGES) for (const [from,to] of [[edge.from,edge.to],[edge.to,edge.from]]) {
      const route=pathForEdge(from,to)!;
      expect(isPathClear(route.points),`${from} → ${to}`).toBe(true);
      expect(route.points[0]).toEqual(VISIT_NODES[from].position);
      expect(route.points.at(-1)).toEqual(VISIT_NODES[to].position);
    }
  });
  it('connects every point to the exterior and the same stage through both doors',()=>{
    for(const node of Object.keys(VISIT_NODES) as VisitNode[]) {
      expect(routeBetween('exterior',node).at(-1)).toBe(node);
      expect(routeBetween(node,'exterior').at(-1)).toBe('exterior');
    }
    expect(neighbors('leftDoor')).toContain('leftArrival');
    expect(neighbors('rightDoor')).toContain('rightArrival');
    expect(neighbors('panel')).toEqual(['leftArrival','rightArrival']);
    expect(pathForEdge('hall','panel')).toBeNull();
  });
  it('rejects shortcuts through chairs, the front wall, handrails and the stage',()=>{
    expect(isPathClear([[-9.5,2,-15],[0,2,-15]])).toBe(false);
    expect(isPathClear([[3,1.68,2],[3,1.68,-3]])).toBe(false);
    expect(isPathClear([[-11,2,-5],[-9.5,2,-5]])).toBe(false);
    expect(isPathClear([[0,1.68,-27],[0,1.68,-33]])).toBe(false);
    expect(isPathClear([[16,1.68,2],[16,1.68,-5]])).toBe(false);
  });
  it('keeps the complete panel in portrait view along an unobstructed central aisle',()=>{
    for(const aspect of [.45,.73,1,1.89]) {
      const position=panelViewPosition(aspect,65);
      const visibleWidth=2*(position[2]-VENUE.screen.z)*Math.tan(65*Math.PI/360)*aspect;
      expect(visibleWidth).toBeGreaterThan(VENUE.screen.width);
      expect(isPathClear([[0,1.68,-27],position])).toBe(true);
      expect(isPathClear([position,[0,1.68,-27]])).toBe(true);
    }
  });
});
