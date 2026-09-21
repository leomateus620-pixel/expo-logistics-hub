import { createContext, useContext } from 'react';
import type { PublicExternalScenePolicy } from '../../public/publicScenePolicy';

export const PublicScenePolicyContext = createContext<PublicExternalScenePolicy | null>(null);
export const usePublicScenePolicy = () => useContext(PublicScenePolicyContext);
export const useSceneVegetationEnabled = () => usePublicScenePolicy()?.vegetationEnabled !== false;
