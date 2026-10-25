import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSoyPlaybackClock, createSoyWorkPose, sampleSoyCycle, sampleSoyPlant, sampleSoyWorkPath, SOY_HARVEST_DURATION, SOY_HARVEST_PHASES, SOY_VISIBLE_WORK_SPEED, soyPassageDistance, soyPassageVisibility, soyPhaseAt, soyTransportDistance, tickSoyPlaybackClock } from '@/features/commercial-map/harvest/soyHarvestTimeline';
import { advanceSoyHarvestClock, setSoyHarvestStartGuard, soyFieldFrame, soyHarvestClock, useSoyHarvestStore } from '@/features/commercial-map/harvest/useSoyHarvestStore';
import { publishSoyHarvestCamera, soyHarvestCameraFrame } from '@/features/commercial-map/harvest/SoyHarvestCamera';

beforeEach(() => {
  useSoyHarvestStore.setState(useSoyHarvestStore.getInitialState(), true);
  setSoyHarvestStartGuard(null);
  soyHarvestClock.elapsed = 0; soyHarvestClock.lastNow = null; soyFieldFrame.mode = 'green';
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  vi.restoreAllMocks();
});
function start() { const store = useSoyHarvestStore.getState(); store.requestStart(); store.ready(useSoyHarvestStore.getState().session); }

describe('48-second soybean cycle', () => {
  it('has seven contiguous phases, independent handling and later maturation', () => {
    expect(SOY_HARVEST_DURATION).toBe(48);
    for (const phase of SOY_HARVEST_PHASES) { expect(soyPhaseAt(phase.start).id).toBe(phase.id); expect(soyPhaseAt(phase.end - .001).id).toBe(phase.id); }
    expect(sampleSoyCycle(20.99).maturation).toBe(0);
    expect(sampleSoyCycle(24).maturation).toBe(.5);
    expect(sampleSoyCycle(48).transport).toBe(1);
  });
  it('waits for readiness, accepts a single start and ignores stale loading completions', () => {
    expect(useSoyHarvestStore.getState().requestStart()).toBe(true);
    const session = useSoyHarvestStore.getState().session;
    expect(useSoyHarvestStore.getState().requestStart()).toBe(false);
    advanceSoyHarvestClock(1000); advanceSoyHarvestClock(60000);
    expect(soyHarvestClock.elapsed).toBe(0);
    useSoyHarvestStore.getState().ready(session - 1); expect(useSoyHarvestStore.getState().status).toBe('loading');
    useSoyHarvestStore.getState().ready(session); advanceSoyHarvestClock(60000); advanceSoyHarvestClock(61000);
    expect(soyHarvestClock.elapsed).toBe(1);
  });
  it('uses monotonic deltas and removes hidden-tab elapsed time', () => {
    const clock = createSoyPlaybackClock();
    tickSoyPlaybackClock(clock, 1000, true); tickSoyPlaybackClock(clock, 2000, true);
    tickSoyPlaybackClock(clock, 1500, true); tickSoyPlaybackClock(clock, 2100, true);
    expect(clock.elapsed).toBeCloseTo(1.1);
    tickSoyPlaybackClock(clock, 2100, false); tickSoyPlaybackClock(clock, 90000, true); tickSoyPlaybackClock(clock, 91000, true);
    expect(clock.elapsed).toBeCloseTo(2.1);
  });
  it('pause/resume keeps the same pose and cannot resume a hidden tab', () => {
    start(); advanceSoyHarvestClock(0); advanceSoyHarvestClock(9000);
    vi.spyOn(performance, 'now').mockReturnValue(9000);
    useSoyHarvestStore.getState().pause(); const paused = soyHarvestClock.elapsed;
    advanceSoyHarvestClock(100000); expect(soyHarvestClock.elapsed).toBe(paused);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    useSoyHarvestStore.getState().resume(); expect(useSoyHarvestStore.getState().status).toBe('paused');
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    useSoyHarvestStore.getState().resume(); advanceSoyHarvestClock(100000); advanceSoyHarvestClock(101000);
    expect(soyHarvestClock.elapsed).toBe(paused + 1);
  });
  it('keeps the harvested composition after return and explicitly restores or replays', () => {
    start(); advanceSoyHarvestClock(0); advanceSoyHarvestClock(48000);
    expect(useSoyHarvestStore.getState()).toMatchObject({ status: 'completed', fieldState: 'harvested', enabled: true });
    advanceSoyHarvestClock(90000); expect(soyHarvestClock.elapsed).toBe(48);
    useSoyHarvestStore.getState().returnToMap(); useSoyHarvestStore.getState().finishRestore();
    expect(useSoyHarvestStore.getState()).toMatchObject({ status: 'completed', fieldState: 'harvested', enabled: false });
    useSoyHarvestStore.getState().replay(); expect(soyHarvestClock.elapsed).toBe(0);
    expect(useSoyHarvestStore.getState().status).toBe('loading');
    useSoyHarvestStore.getState().cancel(); useSoyHarvestStore.getState().finishRestore();
    expect(useSoyHarvestStore.getState()).toMatchObject({ status: 'idle', fieldState: 'green', enabled: false });
    expect(soyFieldFrame.mode).toBe('green');
  });
  it('cancels an outstanding load, releases ownership on error and allows retry', () => {
    useSoyHarvestStore.getState().requestStart(); const old = useSoyHarvestStore.getState().session;
    useSoyHarvestStore.getState().cancel(); useSoyHarvestStore.getState().finishRestore(); useSoyHarvestStore.getState().ready(old);
    expect(useSoyHarvestStore.getState().status).toBe('idle');
    start(); useSoyHarvestStore.getState().fail('Falha local');
    expect(useSoyHarvestStore.getState()).toMatchObject({ status: 'error', enabled: false, fieldState: 'green' });
    useSoyHarvestStore.getState().replay(); expect(useSoyHarvestStore.getState().status).toBe('loading');
  });
  it('revalidates camera/scope availability on replay after returning to the map', () => {
    useSoyHarvestStore.setState({ status: 'completed', enabled: false, fieldState: 'harvested' });
    setSoyHarvestStartGuard(() => 'Encerre a visita para ver o ciclo.');
    useSoyHarvestStore.getState().replay();
    expect(useSoyHarvestStore.getState()).toMatchObject({ status: 'completed', enabled: false, error: 'Encerre a visita para ver o ciclo.' });
    setSoyHarvestStartGuard(null);
    useSoyHarvestStore.getState().replay(); expect(useSoyHarvestStore.getState().status).toBe('loading');
  });
});

describe('implement masks and discharge sequencing', () => {
  it('tracks each actual pass including the interval spent turning', () => {
    const target = createSoyWorkPose();
    for (let i = 1; i < 999; i += 1) {
      const time = i / 1000 * 6, pose = sampleSoyWorkPath(sampleSoyCycle(time).planted, target);
      for (let lane = 0; lane < 3; lane += 1) {
        const ahead = Math.min(.99999, pose.lanes[lane] + .001);
        if (pose.lanes[lane] < .998) expect(sampleSoyPlant(time, ahead, lane, 3).planted).toBe(false);
        if (pose.lanes[lane] > .002) expect(sampleSoyPlant(time, pose.lanes[lane] - .001, lane, 3).planted).toBe(true);
      }
      expect(pose.x).toBeGreaterThanOrEqual(42.09); expect(pose.x).toBeLessThanOrEqual(61.91);
      expect(pose.z).toBeGreaterThanOrEqual(-56.301); expect(pose.z).toBeLessThanOrEqual(-52.699);
    }
    expect(sampleSoyWorkPath(1, target).lanes).toEqual([1, 1, 1]);
  });
  it('shows normal agricultural speeds and reserves accelerated travel for complete dissolves', () => {
    for (const [duration, speed, count] of [[6, SOY_VISIBLE_WORK_SPEED.planting, 3], [9.4, SOY_VISIBLE_WORK_SPEED.harvest, 3], [5, SOY_VISIBLE_WORK_SPEED.management, 1]] as const) {
      let previousDistance = 0, previousVisibility = 0, visibleSeconds = 0;
      for (let i = 1; i <= Math.round(duration * 1000); i += 1) {
        const time = i / 1000, distance = soyPassageDistance(time, duration, speed, count), visibility = soyPassageVisibility(time, duration, count);
        expect(distance).toBeGreaterThanOrEqual(previousDistance - 1e-8);
        if (visibility > 0 && previousVisibility > 0) {
          expect((distance - previousDistance) * 1000).toBeLessThanOrEqual(speed + 1e-7);
          visibleSeconds += .001;
        }
        previousDistance = distance; previousVisibility = visibility;
      }
      expect(visibleSeconds).toBeGreaterThan(duration * .6);
      expect(soyPassageVisibility(duration, duration, count)).toBe(0);
      expect(speed / .15 * 3.6).toBeLessThanOrEqual(count === 3 && duration > 6 ? 12 : 20);
    }
  });
  it('keeps all harvested lanes monotonic through ellipses and approaches unloading slowly', () => {
    const pose = createSoyWorkPose(), previous = [0, 0, 0];
    let previousArrival = 0, previousVisibility = 0;
    for (let i = 27000; i <= 37500; i += 2) {
      const time = i / 1000, sample = sampleSoyCycle(time);
      sampleSoyWorkPath(sample.harvested, pose);
      for (let lane = 0; lane < 3; lane += 1) { expect(pose.lanes[lane]).toBeGreaterThanOrEqual(previous[lane] - 1e-8); previous[lane] = pose.lanes[lane]; }
      if (!pose.working && time < 36.4) expect(sample.harvestVisibility).toBe(0);
      if (sample.combineArrivalVisibility > 0 && previousVisibility > 0) expect((sample.combineArrival - previousArrival) / .002).toBeLessThanOrEqual(.50001);
      previousArrival = sample.combineArrival; previousVisibility = sample.combineArrivalVisibility;
    }
    expect(previous).toEqual([1, 1, 1]); expect(sampleSoyCycle(37.4).combineArrival).toBeCloseTo(2.2485);
  });
  it('departs with the truck at30km/h and condenses its remaining off-screen route', () => {
    const length = 31;
    for (let time = 44; time < 45.199; time += .01) expect(soyTransportDistance(time + .001, length) - soyTransportDistance(time, length)).toBeLessThanOrEqual(.001251);
    for (let time = 45.2; time < 47.799; time += .01) expect(soyTransportDistance(time + .001, length) - soyTransportDistance(time, length)).toBeLessThanOrEqual(.002501);
    expect(soyTransportDistance(44, length)).toBe(0); expect(soyTransportDistance(48, length)).toBe(length);
  });
  it('never moves truck or folds tube while grain is flowing', () => {
    for (let t = 0; t < 48; t += .01) {
      const sample = sampleSoyCycle(t);
      if (sample.unloading) { expect(sample.auger).toBe(1); expect(sample.transport).toBe(0); }
      if (sample.transport > 0) { expect(sample.unloading).toBe(false); expect(sample.auger).toBe(0); expect(sample.truckFill).toBe(1); }
    }
    expect(sampleSoyCycle(38.49).truckFill).toBe(0); expect(sampleSoyCycle(43).truckFill).toBe(1);
  });
});

describe('camera pose handoff', () => {
  it('begins from the exact captured view and keeps reduced-motion presentation stable', () => {
    Object.assign(soyHarvestCameraFrame.initial, { captured: true, position: { x: 10, y: 20, z: 30 }, target: { x: 1, y: 2, z: 3 }, fov: 38 });
    publishSoyHarvestCamera(0, false, false);
    expect(soyHarvestCameraFrame.position).toEqual({ x: 10, y: 20, z: 30 });
    expect(soyHarvestCameraFrame.target).toEqual({ x: 1, y: 2, z: 3 });
    publishSoyHarvestCamera(6, true, false); const stable = { ...soyHarvestCameraFrame.position };
    publishSoyHarvestCamera(43, true, false); expect(soyHarvestCameraFrame.position).toEqual(stable);
    publishSoyHarvestCamera(43, true, true); expect(soyHarvestCameraFrame.position.y).toBeGreaterThan(stable.y);
  });
});
