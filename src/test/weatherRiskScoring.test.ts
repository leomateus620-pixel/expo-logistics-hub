import { describe, it, expect } from 'vitest';
import { calculateOperationalRisk } from '@/lib/weatherRiskScoring';

describe('calculateOperationalRisk', () => {
  it('returns favoravel for calm conditions', () => {
    const r = calculateOperationalRisk({
      temperature_c: 22, precipitation_probability_pct: 5, wind_speed_kph: 10, visibility_km: 15,
    });
    expect(r.level).toBe('favoravel');
  });

  it('returns atencao for moderate rain', () => {
    const r = calculateOperationalRisk({ precipitation_probability_pct: 35, wind_speed_kph: 10 });
    expect(r.level).toBe('atencao');
  });

  it('returns atencao for moderate wind', () => {
    const r = calculateOperationalRisk({ wind_speed_kph: 28 });
    expect(r.level).toBe('atencao');
  });

  it('returns atencao for reduced visibility', () => {
    const r = calculateOperationalRisk({ visibility_km: 3 });
    expect(r.level).toBe('atencao');
  });

  it('returns atencao for fog condition label', () => {
    const r = calculateOperationalRisk({ current_condition_label: 'Neblina densa' });
    expect(r.level).toBe('atencao');
  });

  it('returns alerta for high rain probability', () => {
    const r = calculateOperationalRisk({ precipitation_probability_pct: 70 });
    expect(r.level).toBe('alerta');
  });

  it('returns alerta for strong wind', () => {
    const r = calculateOperationalRisk({ wind_speed_kph: 45 });
    expect(r.level).toBe('alerta');
  });

  it('returns alerta for moderate thunderstorm', () => {
    const r = calculateOperationalRisk({ thunderstorm_probability_pct: 50 });
    expect(r.level).toBe('alerta');
  });

  it('returns alerta for extreme heat', () => {
    const r = calculateOperationalRisk({ temperature_c: 40 });
    expect(r.level).toBe('alerta');
  });

  it('returns alerta for extreme cold', () => {
    const r = calculateOperationalRisk({ temperature_c: 2 });
    expect(r.level).toBe('alerta');
  });

  it('returns alerta when public alert is present', () => {
    const r = calculateOperationalRisk({
      alert_count: 1, alerts_summary: [{ severity: 'moderate', title: 'Aviso de chuva' }],
    });
    expect(r.level).toBe('alerta');
  });

  it('returns critico for severe alert', () => {
    const r = calculateOperationalRisk({
      alerts_summary: [{ severity: 'severe', title: 'Tempestade severa' }],
    });
    expect(r.level).toBe('critico');
  });

  it('returns critico for heavy rain + high wind combo', () => {
    const r = calculateOperationalRisk({ precipitation_probability_pct: 90, wind_speed_kph: 55 });
    expect(r.level).toBe('critico');
  });

  it('returns critico for very low visibility', () => {
    const r = calculateOperationalRisk({ visibility_km: 0.5 });
    expect(r.level).toBe('critico');
  });

  it('returns critico for high thunderstorm probability', () => {
    const r = calculateOperationalRisk({ thunderstorm_probability_pct: 80 });
    expect(r.level).toBe('critico');
  });

  it('returns critico for extreme wind gusts', () => {
    const r = calculateOperationalRisk({ wind_gust_kph: 80 });
    expect(r.level).toBe('critico');
  });

  it('escalates to highest severity when multiple rules trigger', () => {
    const r = calculateOperationalRisk({
      precipitation_probability_pct: 35, wind_speed_kph: 60, thunderstorm_probability_pct: 80,
    });
    expect(r.level).toBe('critico');
  });

  it('produces a non-empty Portuguese reason string', () => {
    const r = calculateOperationalRisk({ precipitation_probability_pct: 70 });
    expect(r.reason).toBeTruthy();
    expect(typeof r.reason).toBe('string');
  });
});
