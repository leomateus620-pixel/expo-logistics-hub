import { createContext, useContext } from 'react';

export const CommercialMapPresentationVisibility = createContext(true);
export const useCommercialMapPresentationVisible = () => useContext(CommercialMapPresentationVisibility);
