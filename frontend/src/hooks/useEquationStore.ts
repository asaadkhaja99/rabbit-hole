import { useCallback, useRef, useState } from 'react';
import type { EquationInfo } from '../utils/equation-extractor';

export interface EquationStore {
  equations: Map<string, EquationInfo>;
  addEquation: (equationNumber: string, info: EquationInfo) => void;
  getEquation: (equationNumber: string) => EquationInfo | undefined;
  hasEquation: (equationNumber: string) => boolean;
  clear: () => void;
  isReady: boolean;
  setReady: (ready: boolean) => void;
}

/**
 * Hook to manage equation cache for the current PDF
 * Stores equation info keyed by equation number (e.g., "1", "2a")
 */
export function useEquationStore(): EquationStore {
  const equationsRef = useRef<Map<string, EquationInfo>>(new Map());
  const [isReady, setIsReady] = useState(false);

  const addEquation = useCallback((equationNumber: string, info: EquationInfo) => {
    equationsRef.current.set(equationNumber, info);
  }, []);

  const getEquation = useCallback((equationNumber: string): EquationInfo | undefined => {
    return equationsRef.current.get(equationNumber);
  }, []);

  const hasEquation = useCallback((equationNumber: string): boolean => {
    return equationsRef.current.has(equationNumber);
  }, []);

  const clear = useCallback(() => {
    equationsRef.current.clear();
    setIsReady(false);
  }, []);

  const setReady = useCallback((ready: boolean) => {
    setIsReady(ready);
  }, []);

  return {
    equations: equationsRef.current,
    addEquation,
    getEquation,
    hasEquation,
    clear,
    isReady,
    setReady,
  };
}
