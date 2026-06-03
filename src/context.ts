import { createContext } from "react";
/** @typedef {import("./types").Debate} Debate */

export type AppCtx = {
  dispatch: (action: any) => void;
  debates: any[];
  myRep: number;
  me: string | null;
  isAuthed: boolean;
  myAvatar?: string | null;
  setAvatar?: (id: string | null) => void;
};

// ─── App context (dispatch / debates / 動的rep を配布) ────────────
export const AppContext = createContext<AppCtx>({ dispatch: () => {}, debates: [], myRep: 0, me: null, isAuthed: false, myAvatar: null, setAvatar: () => {} });
