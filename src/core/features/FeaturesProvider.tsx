'use client';

import { createContext, useContext } from 'react';
import { ALL_FEATURES_ON, type Features } from './catalog';

const FeaturesContext = createContext<Features>(ALL_FEATURES_ON);

/** The lab's switches for every screen below it. Outside the staff app everything reads as on. */
export function FeaturesProvider({ features, children }: { features: Features; children: React.ReactNode }) {
  return <FeaturesContext.Provider value={features}>{children}</FeaturesContext.Provider>;
}

export function useFeatures(): Features {
  return useContext(FeaturesContext);
}
