import { create } from 'zustand'
import type { Category, PublicBankQuestion } from '../../shared/protocol'
import { supabase } from './supabase'

type CatalogState = {
  categories: Category[]
  questions: PublicBankQuestion[]
  loaded: boolean
  error: string | null
  load: () => Promise<void>
}

/**
 * Categorías y preguntas públicas (sin la respuesta correcta, que la DB
 * oculta por columnas). Se cargan una vez por sesión desde Supabase.
 */
export const useCatalog = create<CatalogState>()((set, get) => ({
  categories: [],
  questions: [],
  loaded: false,
  error: null,

  load: async () => {
    if (get().loaded || !supabase) return
    const [cats, qs] = await Promise.all([
      supabase.from('categories').select('id, name, color').order('id'),
      supabase.from('questions').select('id, category_id, text, options'),
    ])
    if (cats.error || qs.error) {
      set({ error: cats.error?.message ?? qs.error?.message ?? 'Error cargando el catálogo' })
      return
    }
    set({
      categories: (cats.data ?? []) as unknown as Category[],
      questions: (qs.data ?? []) as unknown as PublicBankQuestion[],
      loaded: true,
      error: null,
    })
  },
}))
