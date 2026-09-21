import { describe, expect, it } from 'vitest';
import {
  PAVILION_MODULE_AREA_SOURCE_DOCUMENTS,
  PAVILION_MODULE_AREA_TOTALS,
  PAVILION_MODULE_OFFICIAL_AREAS,
  formatAreaSqm,
  getPavilionModuleArea,
} from '@/features/commercial-map/data/pavilionModuleOfficialAreas';
import { COMMERCIAL_PAVILION_MODULE_PLANS } from '@/features/commercial-map/utils/commercialPavilionModules';

const EXPECTED_TOTALS: Record<string, number> = {
  B1: 586.5,
  B6: 663,
  B8: 244.5,
  B10: 427.5,
  B4: 438.5,
  B3: 771,
  B5: 351,
  B2: 616,
};

describe('metragens oficiais dos lotes internos dos pavilhões', () => {
  it('cobre exatamente os 1.315 módulos cadastrados', () => {
    expect(PAVILION_MODULE_OFFICIAL_AREAS.size).toBe(1315);
    const total = [...PAVILION_MODULE_OFFICIAL_AREAS.values()]
      .reduce((sum, entry) => sum + entry.areaSqm, 0);
    expect(total).toBeCloseTo(4098, 10);
  });

  it('fecha a soma documental de cada pavilhão lote a lote', () => {
    PAVILION_MODULE_AREA_TOTALS.forEach((summary) => {
      const modules = [...PAVILION_MODULE_OFFICIAL_AREAS.values()]
        .filter((entry) => entry.pavilionId === summary.pavilionId);
      expect(modules).toHaveLength(summary.moduleCount);
      expect(modules.reduce((sum, entry) => sum + entry.areaSqm, 0))
        .toBeCloseTo(EXPECTED_TOTALS[summary.pavilionId], 10);
      const numbers = modules.map((entry) => entry.moduleNumber).sort((a, b) => a - b);
      expect(numbers).toEqual(
        Array.from({ length: summary.moduleCount }, (_, index) => index + 1),
      );
    });
  });

  it('mantém as exceções escritas no croqui e suas transições', () => {
    expect(getPavilionModuleArea('B1', 57)?.areaSqm).toBe(3);
    expect(getPavilionModuleArea('B1', 58)?.areaSqm).toBe(4.5);
    expect(getPavilionModuleArea('B1', 59)?.areaSqm).toBe(3.5);
    expect(getPavilionModuleArea('B1', 64)?.areaSqm).toBe(3.5);
    expect(getPavilionModuleArea('B1', 65)?.areaSqm).toBe(3);
    expect(getPavilionModuleArea('B1', 140)?.areaSqm).toBe(3);
    expect(getPavilionModuleArea('B1', 141)?.areaSqm).toBe(18);
    expect(getPavilionModuleArea('B1', 142)?.areaSqm).toBe(3);

    expect(getPavilionModuleArea('B6', 35)?.areaSqm).toBe(3);
    expect(getPavilionModuleArea('B6', 36)?.areaSqm).toBe(24);
    [37, 38, 39, 40].forEach((number) => {
      expect(getPavilionModuleArea('B6', number)?.areaSqm).toBe(3);
    });

    expect(getPavilionModuleArea('B8', 1)?.areaSqm).toBe(4.5);
    expect(getPavilionModuleArea('B8', 2)?.areaSqm).toBe(3);

    expect(getPavilionModuleArea('B4', 25)?.areaSqm).toBe(4);
    expect(getPavilionModuleArea('B4', 26)?.areaSqm).toBe(3);
    expect(getPavilionModuleArea('B4', 37)?.areaSqm).toBe(3);
    expect(getPavilionModuleArea('B4', 38)?.areaSqm).toBe(3.5);
    expect(getPavilionModuleArea('B4', 89)?.areaSqm).toBe(3.5);
    expect(getPavilionModuleArea('B4', 90)?.areaSqm).toBe(24.5);
    expect(getPavilionModuleArea('B4', 91)?.areaSqm).toBe(4);

    [25, 26, 78, 79].forEach((number) => {
      expect(getPavilionModuleArea('B5', number)?.areaSqm).toBe(13.5);
      expect(getPavilionModuleArea('B5', number)?.evidence).toBe('written');
      expect(getPavilionModuleArea('B5', number)?.validationStatus).toBe('VALIDATED');
      expect(getPavilionModuleArea('B5', number)?.caveat).toBeNull();
    });

    expect(getPavilionModuleArea('B2', 35)?.areaSqm).toBe(3);
    expect(getPavilionModuleArea('B2', 36)?.areaSqm).toBe(3.5);
    expect(getPavilionModuleArea('B2', 151)?.areaSqm).toBe(3.5);
    expect(getPavilionModuleArea('B2', 152)?.areaSqm).toBe(3);
  });

  it('atribui a fonte oficial 2028 sem alterar as áreas do B4', () => {
    expect(PAVILION_MODULE_AREA_SOURCE_DOCUMENTS.B4)
      .toBe('Planta PAVILHÃO 8 - Fenasoja 2028.pdf');
    const pavilion8 = [...PAVILION_MODULE_OFFICIAL_AREAS.values()]
      .filter((entry) => entry.pavilionId === 'B4');
    expect(pavilion8).toHaveLength(114);
    expect(pavilion8.reduce((sum, entry) => sum + entry.areaSqm, 0)).toBe(438.5);
  });

  it('remove a ressalva superada do B5-M078 pela planta oficial 2028', () => {
    const validated = getPavilionModuleArea('B5', 78);
    expect(validated?.areaSqm).toBe(13.5);
    expect(validated?.evidence).toBe('written');
    expect(validated?.validationStatus).toBe('VALIDATED');
    expect(validated?.caveat).toBeNull();
  });

  it('registra as ressalvas documentais dos pavilhões 7 e 14', () => {
    const p7 = PAVILION_MODULE_AREA_TOTALS.find((item) => item.pavilionId === 'B10');
    expect(p7?.documentalCaveat).toContain('57 módulos');
    const p14 = PAVILION_MODULE_AREA_TOTALS.find((item) => item.pavilionId === 'B2');
    expect(p14?.stampedTotalSqm).toBe(616.16);
    expect(p14?.documentalCaveat).toContain('0,16');
  });

  it('propaga a metragem para as células de todos os planos de pavilhão', () => {
    Object.entries(COMMERCIAL_PAVILION_MODULE_PLANS).forEach(([publicIdentifier, plan]) => {
      if (!(publicIdentifier in EXPECTED_TOTALS)) return;
      expect(plan.cells.every((cell) => typeof cell.areaM2 === 'number')).toBe(true);
      expect(plan.cells.reduce((sum, cell) => sum + (cell.areaM2 ?? 0), 0))
        .toBeCloseTo(EXPECTED_TOTALS[publicIdentifier], 9);
    });
  });

  it('formata a metragem em pt-BR com duas casas', () => {
    expect(formatAreaSqm(3)).toBe('3,00 m²');
    expect(formatAreaSqm(19.35)).toBe('19,35 m²');
  });
});
