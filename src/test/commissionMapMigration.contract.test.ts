// @vitest-environment ./src/test/venueSqlNode.environment.ts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260804090000_create_commission_map_segments.sql'),
  'utf8',
);
const service = readFileSync(
  resolve('src/features/commercial-map/services/commercialMapService.ts'),
  'utf8',
);
const app = readFileSync(resolve('src/App.tsx'), 'utf8');
const sql = migration.replace(/\s+/g, ' ').toLowerCase();
const scopedFetch = service.slice(
  service.indexOf('async function fetchCommissionCommercialMap'),
  service.indexOf('export async function fetchCommercialMap'),
);

describe('contrato persistido dos mapas por comissão', () => {
  it('cria membership exclusivo, determinístico e ligado ao mesmo projeto', () => {
    expect(sql).toContain('create table if not exists public.map_segments');
    expect(sql).toContain('constraint map_segments_project_slug_unique unique (project_id, slug)');
    expect(sql).toContain('add column if not exists segment_id uuid references public.map_segments(id) on delete set null');
    expect(sql).toContain("segment.slug in ('exporural', 'industria-comercio-servicos')");
    expect(sql).toContain("entity.public_identifier ~ '^q-[rs]-[0-9]{2}$'");
    expect(sql).toContain("entity.public_identifier ~ '^q-(m|g|l|f|j|e|i|d)-[0-9]{2}$'");
    expect(sql).toContain("entity.public_identifier <> all (array['b7', 'b8', 'd3'])");
    expect(sql).toContain('map_segment_project_mismatch');
    expect(sql).toContain('after insert on public.map_projects');
    expect(sql).toContain('commercial_lot_segment_sync');
    expect(sql).toContain('map_lot_lineage_segment_inheritance');
    expect(sql).toContain('map_segment_merge_conflict');
    expect(sql).toContain('map_segment_project_immutable');
    expect(sql).toContain('map_segment_boundary_admin_required');
    expect(sql).toContain('map_entity_segment_lifecycle_guard');
    expect(sql).toContain('reconcile_commission_map_lineage');
    expect(sql).toContain('map_segment_lineage_inventory_delta');
    expect(sql).toContain('lineagebaselineat');
    expect(sql).toContain('lineage.created_at > scope.baseline_at');
    expect(sql).toContain("source_entity.metadata->>'archivedbyreferencerevision' is not null");
    expect(sql).toContain("source_entity.metadata->'replacementlotidentifiers' ? upper(target_lot.public_identifier)");
    expect(sql).toContain('map_segment_lineage_project_mismatch');
    expect(sql).toContain('map_segment_baseline_count');
    expect(sql).toContain('inventory.entity_count = baseline.entity_count + lineage.delta');
    expect(sql).toContain('inventory.lot_count = baseline.lot_count + lineage.delta');
    expect(sql).toContain('drop policy if exists map_lot_lineage_insert');
    expect(sql).toContain('revoke insert, update, delete on table public.map_lot_lineage from public, anon, authenticated');
  });

  it('aplica RLS por capability sem liberar referência ou entidades do parque completo', () => {
    expect(sql).toContain('create or replace function public.map_can_access_segment(_segment_id uuid)');
    expect(sql).toContain('segment.required_capability');
    expect(sql).toContain('segment_id is not null and public.map_can_access_segment(segment_id)');
    expect(sql).toContain('entity.id = map_entity_geometries.entity_id');
    expect(sql).toContain('entity.layer_id = map_layers.id');
    expect(sql).toContain('public.is_org_member(auth.uid(), project.org_id)');
    expect(sql).toContain("select auth.role() = 'service_role' or ( public.is_org_member(auth.uid(), _org_id) and");
    expect(sql).toContain('project.is_archived = false');
    expect(sql).toContain('public.map_segment_is_complete(segment.id)');
    expect(sql).toContain('map_entities_segment_project_fk');
    expect(sql).toContain('map_geometries_entity_project_fk');
    expect(sql).not.toContain('create policy map_calibrations_commission_segment_select on public.map_calibrations');
    expect(sql).toContain('revoke all on function public.map_can_access_segment(uuid) from public');
    expect(sql).toContain('grant execute on function public.map_can_access_segment(uuid) to authenticated');
  });

  it('consulta somente o segment_id persistido e falha fechado sem fallback local', () => {
    expect(scopedFetch).toContain(".from('map_segments')");
    expect(scopedFetch).toContain(".eq('segment_id', segment.id)");
    expect(scopedFetch).toContain(".in('entity_id', entityIds)");
    expect(scopedFetch).toContain("expire_commission_segment_reservations");
    expect(scopedFetch).toContain("get_commission_map_segment_inventory");
    expect(scopedFetch).toContain('calibration: null');
    expect(scopedFetch).toContain("commissionMapError('MAP_SEGMENT_INVENTORY_MISMATCH')");
    expect(scopedFetch).toContain("commissionMapError('MAP_SEGMENT_EMPTY')");
    expect(scopedFetch).not.toContain('OFFICIAL_REFERENCE_DATA');
  });

  it('preserva a cadeia Auth, organização e capability antes da rota interna', () => {
    const routeStart = app.indexOf('if (mapPortal)');
    const routeEnd = app.indexOf("if (module.slug === 'logistica')", routeStart);
    const route = routeEnd > routeStart ? app.slice(routeStart, routeEnd) : app.slice(routeStart);

    expect(routeStart).toBeGreaterThan(-1);
    expect(route).toContain('<AuthGuard>');
    expect(route).toContain('<OrgGuard>');
    expect(route).toContain('<ModuleAccessGuard module={module}>');
    expect(route).toContain('path="mapa-comercial"');
    expect(route).toContain('<CommissionCommercialMapPage portal={mapPortal} />');
  });
});
