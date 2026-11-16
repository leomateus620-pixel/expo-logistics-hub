import type { CommercialMapData } from '../types';
import { withRuralPavilionReconstruction } from '../data/ruralPavilionReconstruction';
import { withArenaReconstruction } from '../data/arenaCanonicalLayout';
import { withFenasojaComplexReconstruction } from '../data/fenasojaComplexReconstruction';
import { withMiranteComplexReconstruction } from '../data/miranteComplexReconstruction';
import { withCommercialMapSegments } from '../data/commercialMapSegments';
import { withUnifiedFenasojaRestaurant } from './fenasojaRestaurant';
import { withChoppTruckReference } from './choppTruck';

/** Shared authorized snapshot presentation; cadastral records stay unchanged. */
export function presentCommercialMapData<T extends CommercialMapData>(data: T): T {
  return withChoppTruckReference(withCommercialMapSegments(withUnifiedFenasojaRestaurant(
    withRuralPavilionReconstruction(withArenaReconstruction(withMiranteComplexReconstruction(withFenasojaComplexReconstruction(data)))),
  )));
}
