import { describe, expect, it } from 'vitest';
import { classifyRestaurantAlert, restaurantAlertWindow } from './event-center-restaurant-conflicts';
import { locationCodeForText } from './cronograma-location-options';

describe('Restaurant alert civil dates', () => {
  it('includes one day either side across a month boundary', () => {
    expect(restaurantAlertWindow('2028-02-29', null)).toEqual({ start: '2028-02-28', end: '2028-03-01' });
    expect(classifyRestaurantAlert('2028-02-28', '2028-02-28', '2028-02-29', '2028-02-29')).toBe('1 dia antes');
    expect(classifyRestaurantAlert('2028-03-01', '2028-03-01', '2028-02-29', '2028-02-29')).toBe('1 dia depois');
  });
  it('covers multiday events and year boundaries without relying on local timezone', () => {
    expect(restaurantAlertWindow('2028-12-31', '2029-01-02')).toEqual({ start: '2028-12-30', end: '2029-01-03' });
    expect(classifyRestaurantAlert('2029-01-01', '2029-01-01', '2028-12-31', '2029-01-02')).toBe('durante o evento');
    expect(classifyRestaurantAlert('2028-12-31', '2028-12-31', '2028-12-31', '2028-12-31')).toBe('no mesmo dia');
  });
  it('refuses missing or reversed dates and never infers a code from a similar name', () => {
    expect(restaurantAlertWindow(null, null)).toBeNull();
    expect(restaurantAlertWindow('2028-02-29', '2028-02-28')).toBeNull();
    expect(locationCodeForText('Centro de eventos')).toBeNull();
    expect(locationCodeForText('CENTRO DE EVENTOS FENASOJA')).toBe('centro_eventos_fenasoja');
  });
});