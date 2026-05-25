"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Usuario } from "./supabase/types";

interface UserState {
  user: Usuario | null;
  setUser: (u: Usuario | null) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (u) => set({ user: u }),
      logout: () => set({ user: null }),
    }),
    { name: "painel-contabil-user" }
  )
);
