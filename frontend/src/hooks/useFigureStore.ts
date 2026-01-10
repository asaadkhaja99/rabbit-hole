import { useCallback, useRef, useState } from 'react';
import type { FigureInfo } from '../utils/figure-extractor';

export interface FigureStore {
  figures: Map<string, FigureInfo>;
  addFigure: (figureNumber: string, info: FigureInfo) => void;
  getFigure: (figureNumber: string) => FigureInfo | undefined;
  hasFigure: (figureNumber: string) => boolean;
  clear: () => void;
  isReady: boolean;
  setReady: (ready: boolean) => void;
}

/**
 * Hook to manage figure cache for the current PDF
 * Stores figure info keyed by figure number (e.g., "1", "2a")
 */
export function useFigureStore(): FigureStore {
  const figuresRef = useRef<Map<string, FigureInfo>>(new Map());
  const [isReady, setIsReady] = useState(false);

  const addFigure = useCallback((figureNumber: string, info: FigureInfo) => {
    figuresRef.current.set(figureNumber, info);
  }, []);

  const getFigure = useCallback((figureNumber: string): FigureInfo | undefined => {
    return figuresRef.current.get(figureNumber);
  }, []);

  const hasFigure = useCallback((figureNumber: string): boolean => {
    return figuresRef.current.has(figureNumber);
  }, []);

  const clear = useCallback(() => {
    figuresRef.current.clear();
    setIsReady(false);
  }, []);

  const setReady = useCallback((ready: boolean) => {
    setIsReady(ready);
  }, []);

  return {
    figures: figuresRef.current,
    addFigure,
    getFigure,
    hasFigure,
    clear,
    isReady,
    setReady,
  };
}
