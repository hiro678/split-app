import { createContext } from "react";

// ─── App context (dispatch / debates / 動的rep を配布) ────────────
export const AppContext = createContext({ dispatch: () => {}, debates: [], myRep: 0, me: null, isAuthed: false });
