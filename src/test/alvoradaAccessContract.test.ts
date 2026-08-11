import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(path), 'utf8');
}

function implementationSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'test' ? [] : implementationSources(absolute);
    }
    return ['.ts', '.tsx'].includes(extname(entry.name)) ? [absolute] : [];
  });
}

describe('contrato de acesso exclusivo à Alvorada', () => {
  const app = source('src/App.tsx');
  const portalPage = source('src/pages/commissions/CommissionPortalPage.tsx');
  const portalRegistry = source('src/modules/portal/portalRegistry.ts');
  const sidebar = source('src/components/Sidebar.tsx');
  const logisticsLayout = source('src/components/Layout.tsx');
  const brand = source('src/components/brand/FenasojaBrand.tsx');
  const portalHero = source('src/components/portal/FenasojaPortalHero.tsx');
  const experience = source('src/features/alvorada/FenasojaAlvoradaExperience.tsx');
  const allImplementation = implementationSources(resolve('src'))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');

  it('expõe um único launcher no bloco de marca FENASOJA 2028 existente', () => {
    expect(allImplementation.match(/aria-label="Abrir O Nascer da Alvorada"/g)).toHaveLength(1);
    expect(portalPage.match(/className="fenasoja-portal__alvorada-launcher"/g)).toHaveLength(1);
    expect(portalPage).toMatch(
      /<button[\s\S]*?className="fenasoja-portal__alvorada-launcher"[\s\S]*?<FenasojaBrand[\s\S]*?<FenasojaBrand[\s\S]*?<\/button>/,
    );
    expect(portalPage).toContain('aria-haspopup="dialog"');
    expect(portalPage).toContain('aria-expanded={alvoradaOpen}');
  });

  it('não cria rota, deep link, menu, atalho ou registry paralelo', () => {
    for (const sourceText of [app, portalRegistry, sidebar, logisticsLayout, brand]) {
      expect(sourceText).not.toMatch(/\/alvorada|o-nascer-da-alvorada/i);
      expect(sourceText).not.toContain('FenasojaAlvoradaExperience');
    }
    expect(app).not.toMatch(/path=["'].*alvorada/i);
    expect(portalRegistry).not.toMatch(/alvorada/i);
    expect(brand).not.toMatch(/onClick|useNavigate|<Link|<button/);

    const featureConsumers = implementationSources(resolve('src'))
      .filter((file) => readFileSync(file, 'utf8').includes(
        "@/features/alvorada/FenasojaAlvoradaExperience",
      ));
    expect(featureConsumers.map((file) => file.replaceAll('\\', '/'))).toEqual([
      expect.stringMatching(/src\/pages\/commissions\/CommissionPortalPage\.tsx$/),
    ]);
  });

  it('mantém a contagem oficial como experiência separada na rota já existente', () => {
    expect(app).toContain('path="/cronograma-eventos/contagem-oficial"');
    expect(portalPage).toContain('<FenasojaPortalHero />');
    expect(portalHero).toContain('OfficialCountdownCompact');
    expect(portalHero).not.toMatch(/Alvorada|alvorada/);
    expect(experience).not.toMatch(/useNavigate|<Link|window\.location|history\./);
    expect(experience).toContain('role="dialog"');
    expect(experience).toContain('aria-modal="true"');
  });

  it('carrega a cena sob demanda e não redistribui as imagens de referência', () => {
    expect(portalPage).toContain(
      "const loadAlvoradaExperience = () => import('@/features/alvorada/FenasojaAlvoradaExperience')",
    );
    expect(portalPage).toContain('const FenasojaAlvoradaExperience = lazy(loadAlvoradaExperience)');
    expect(portalPage).toContain('<FenasojaAlvoradaExperience onComplete={closeAlvorada} />');

    const shippedAssets = readdirSync(resolve('public/alvorada'));
    expect(shippedAssets).not.toContain('IMG_8957.jpeg');
    expect(shippedAssets).not.toContain('A13B1DEF-5041-4481-A578-F6CE0A44EAA7.png');
    expect(shippedAssets).not.toContain('39DA8852-B59F-4676-928D-EC0CD74917EE.png');
    expect(shippedAssets).not.toContain('AF1D2AF0-2CC5-467E-B1A1-6A108279BCCB.png');
    expect(shippedAssets).not.toContain('0317D251-1A8A-4036-91C2-8DF02808D0DC.png');
  });
});
