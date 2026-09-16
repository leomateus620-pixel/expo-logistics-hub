import { describe, expect, it } from 'vitest';
import {
  resolveCommercialPavilionAccessTooltipLayout,
} from '@/features/commercial-map/utils/commercialPavilionAccessTooltip';

const BOUNDS = { left: 0, top: 0, right: 800, bottom: 600 };
const TOOLTIP = { width: 120, height: 28 };

function anchorAt(centerX: number, centerY: number, size = 44) {
  return {
    left: centerX - size / 2,
    top: centerY - size / 2,
    right: centerX + size / 2,
    bottom: centerY + size / 2,
  };
}

describe('posicionamento do tooltip dos acessos de pavilhão', () => {
  it('prefere abrir acima quando há espaço', () => {
    expect(resolveCommercialPavilionAccessTooltipLayout(anchorAt(400, 300), TOOLTIP, BOUNDS))
      .toEqual({ placement: 'top', shift: 0 });
  });

  it('cai para baixo quando o marcador encosta na borda superior', () => {
    expect(resolveCommercialPavilionAccessTooltipLayout(anchorAt(400, 30), TOOLTIP, BOUNDS))
      .toEqual({ placement: 'bottom', shift: 0 });
  });

  it('usa os lados quando não há altura livre acima nem abaixo', () => {
    const shortBounds = { left: 0, top: 0, right: 800, bottom: 90 };
    expect(resolveCommercialPavilionAccessTooltipLayout(anchorAt(400, 45), TOOLTIP, shortBounds))
      .toMatchObject({ placement: 'right' });
    expect(resolveCommercialPavilionAccessTooltipLayout(anchorAt(760, 45), TOOLTIP, shortBounds))
      .toMatchObject({ placement: 'left' });
  });

  it('desloca o balão no eixo transversal para não sair da área visível', () => {
    const nearLeft = resolveCommercialPavilionAccessTooltipLayout(anchorAt(30, 300), TOOLTIP, BOUNDS);
    expect(nearLeft.placement).toBe('top');
    expect(nearLeft.shift).toBeCloseTo(6 + 60 - 30, 6);

    const nearRight = resolveCommercialPavilionAccessTooltipLayout(anchorAt(780, 300), TOOLTIP, BOUNDS);
    expect(nearRight.placement).toBe('top');
    expect(nearRight.shift).toBeCloseTo(800 - 6 - 60 - 780, 6);
  });

  it('escolhe o lado com mais espaço quando nenhum cabe por inteiro', () => {
    const tinyBounds = { left: 0, top: 0, right: 100, bottom: 60 };
    expect(resolveCommercialPavilionAccessTooltipLayout(anchorAt(20, 40), TOOLTIP, tinyBounds))
      .toMatchObject({ placement: 'right' });
  });
});
