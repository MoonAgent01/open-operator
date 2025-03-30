import { atomWithStorage } from "jotai/utils";

export const contextIdAtom = atomWithStorage("contextId", "");

// WebUI browser integration settings
export const useWebuiBrowserAtom = atomWithStorage("useWebuiBrowser", false);
