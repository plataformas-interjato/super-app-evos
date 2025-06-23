import { useMemo } from 'react';
import { Platform } from 'react-native';

export interface SafeAreaConfig {
  edges: ('top' | 'bottom' | 'left' | 'right')[];
  mode?: 'padding' | 'margin';
}

export const useSafeAreaConfig = (type: 'screen' | 'navigation' | 'modal' = 'screen'): SafeAreaConfig => {
  return useMemo(() => {
    switch (type) {
      case 'screen':
        return {
          edges: ['top'],
          mode: 'padding',
        };
      case 'navigation':
        return {
          edges: ['bottom'],
          mode: 'padding',
        };
      case 'modal':
        return {
          edges: Platform.OS === 'ios' ? ['top', 'bottom'] : ['bottom'],
          mode: 'padding',
        };
      default:
        return {
          edges: ['top'],
          mode: 'padding',
        };
    }
  }, [type]);
};

export const getSafeAreaEdges = (type: 'screen' | 'navigation' | 'modal' = 'screen') => {
  switch (type) {
    case 'screen':
      return ['top'] as const;
    case 'navigation':
      return ['bottom'] as const;
    case 'modal':
      return Platform.OS === 'ios' ? (['top', 'bottom'] as const) : (['bottom'] as const);
    default:
      return ['top'] as const;
  }
}; 