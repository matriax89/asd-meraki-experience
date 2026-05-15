export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      coupons: {
        Row: {
          active: boolean | null
          code: string
          created_at: string | null
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          max_uses: number | null
          min_order_cents: number | null
          updated_at: string | null
          uses_count: number | null
        }
        Insert: {
          active?: boolean | null
          code: string
          created_at?: string | null
          discount_type: string
          discount_value: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          min_order_cents?: number | null
          updated_at?: string | null
          uses_count?: number | null
        }
        Update: {
          active?: boolean | null
          code?: string
          created_at?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          min_order_cents?: number | null
          updated_at?: string | null
          uses_count?: number | null
        }
        Relationships: []
      }
      courses: {
        Row: {
          attivo: boolean | null
          benefici: string[] | null
          copertina_url: string | null
          created_at: string | null
          cta_url: string | null
          descrizione_breve: string | null
          descrizione_lunga: string | null
          disciplina: string
          durata_minuti: number | null
          galleria_urls: string[] | null
          id: string
          instructor_id: string | null
          livello: string | null
          meta_description: string | null
          meta_title: string | null
          nome: string
          ordine_display: number | null
          prezzo_indicativo_cents: number | null
          slug: string
          frequenza: string | null
          attrezzatura_richiesta: string | null
          updated_at: string | null
        }
        Insert: {
          attivo?: boolean | null
          benefici?: string[] | null
          copertina_url?: string | null
          created_at?: string | null
          cta_url?: string | null
          descrizione_breve?: string | null
          descrizione_lunga?: string | null
          disciplina: string
          durata_minuti?: number | null
          galleria_urls?: string[] | null
          id?: string
          instructor_id?: string | null
          livello?: string | null
          meta_description?: string | null
          meta_title?: string | null
          nome: string
          ordine_display?: number | null
          prezzo_indicativo_cents?: number | null
          slug: string
          frequenza?: string | null
          attrezzatura_richiesta?: string | null
          updated_at?: string | null
        }
        Update: {
          attivo?: boolean | null
          benefici?: string[] | null
          copertina_url?: string | null
          created_at?: string | null
          cta_url?: string | null
          descrizione_breve?: string | null
          descrizione_lunga?: string | null
          disciplina?: string
          durata_minuti?: number | null
          galleria_urls?: string[] | null
          id?: string
          instructor_id?: string | null
          livello?: string | null
          meta_description?: string | null
          meta_title?: string | null
          nome?: string
          ordine_display?: number | null
          prezzo_indicativo_cents?: number | null
          slug?: string
          frequenza?: string | null
          attrezzatura_richiesta?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string | null
          descrizione: string | null
          file_path: string
          id: string
          ordine_display: number | null
          pubblicato: boolean | null
          slug: string
          tipo: Database["public"]["Enums"]["document_type_enum"]
          titolo: string
          updated_at: string | null
          versione: string | null
        }
        Insert: {
          created_at?: string | null
          descrizione?: string | null
          file_path: string
          id?: string
          ordine_display?: number | null
          pubblicato?: boolean | null
          slug: string
          tipo: Database["public"]["Enums"]["document_type_enum"]
          titolo: string
          updated_at?: string | null
          versione?: string | null
        }
        Update: {
          created_at?: string | null
          descrizione?: string | null
          file_path?: string
          id?: string
          ordine_display?: number | null
          pubblicato?: boolean | null
          slug?: string
          tipo?: Database["public"]["Enums"]["document_type_enum"]
          titolo?: string
          updated_at?: string | null
          versione?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          attivo: boolean | null
          capacity: number | null
          copertina_url: string | null
          created_at: string | null
          cta_tipo: string | null
          cta_url: string | null
          data_fine: string | null
          data_inizio: string
          descrizione: string | null
          galleria_urls: string[] | null
          id: string
          in_evidenza: boolean | null
          indirizzo: string | null
          location: string | null
          meta_description: string | null
          meta_title: string | null
          posti_venduti: number | null
          prezzo_cents: number | null
          slug: string
          sottotitolo: string | null
          stripe_price_id: string | null
          tipo: Database["public"]["Enums"]["event_tipo_enum"]
          titolo: string
          updated_at: string | null
        }
        Insert: {
          attivo?: boolean | null
          capacity?: number | null
          copertina_url?: string | null
          created_at?: string | null
          cta_tipo?: string | null
          cta_url?: string | null
          data_fine?: string | null
          data_inizio: string
          descrizione?: string | null
          galleria_urls?: string[] | null
          id?: string
          in_evidenza?: boolean | null
          indirizzo?: string | null
          location?: string | null
          meta_description?: string | null
          meta_title?: string | null
          posti_venduti?: number | null
          prezzo_cents?: number | null
          slug: string
          sottotitolo?: string | null
          stripe_price_id?: string | null
          tipo?: Database["public"]["Enums"]["event_tipo_enum"]
          titolo: string
          updated_at?: string | null
        }
        Update: {
          attivo?: boolean | null
          capacity?: number | null
          copertina_url?: string | null
          created_at?: string | null
          cta_tipo?: string | null
          cta_url?: string | null
          data_fine?: string | null
          data_inizio?: string
          descrizione?: string | null
          galleria_urls?: string[] | null
          id?: string
          in_evidenza?: boolean | null
          indirizzo?: string | null
          location?: string | null
          meta_description?: string | null
          meta_title?: string | null
          posti_venduti?: number | null
          prezzo_cents?: number | null
          slug?: string
          sottotitolo?: string | null
          stripe_price_id?: string | null
          tipo?: Database["public"]["Enums"]["event_tipo_enum"]
          titolo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          cognome: string | null
          consenso_marketing: boolean | null
          consenso_privacy: boolean
          created_at: string | null
          email: string | null
          id: string
          interesse: string | null
          messaggio: string | null
          nome: string | null
          source: string
          status: Database["public"]["Enums"]["lead_status_enum"] | null
          telefono: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          cognome?: string | null
          consenso_marketing?: boolean | null
          consenso_privacy?: boolean
          created_at?: string | null
          email?: string | null
          id?: string
          interesse?: string | null
          messaggio?: string | null
          nome?: string | null
          source?: string
          status?: Database["public"]["Enums"]["lead_status_enum"] | null
          telefono: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          cognome?: string | null
          consenso_marketing?: boolean | null
          consenso_privacy?: boolean
          created_at?: string | null
          email?: string | null
          id?: string
          interesse?: string | null
          messaggio?: string | null
          nome?: string | null
          source?: string
          status?: Database["public"]["Enums"]["lead_status_enum"] | null
          telefono?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string | null
          id: string
          order_id: string | null
          prezzo_unitario_cents: number
          product_nome: string
          quantita: number
          sku: string
          totale_cents: number
          variant_descrizione: string | null
          variant_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id?: string | null
          prezzo_unitario_cents: number
          product_nome: string
          quantita: number
          sku: string
          totale_cents: number
          variant_descrizione?: string | null
          variant_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string | null
          prezzo_unitario_cents?: number
          product_nome?: string
          quantita?: number
          sku?: string
          totale_cents?: number
          variant_descrizione?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_cognome: string
          buyer_email: string
          buyer_nome: string
          buyer_telefono: string | null
          consenso_marketing: boolean | null
          created_at: string | null
          delivered_at: string | null
          id: string
          note_cliente: string | null
          numero_ordine: string
          ship_address_line1: string
          ship_address_line2: string | null
          ship_city: string
          ship_country: string
          ship_postal_code: string
          ship_state: string | null
          shipped_at: string | null
          shipping_cents: number
          status: Database["public"]["Enums"]["order_status_enum"] | null
          stripe_payment_intent: string | null
          stripe_session_id: string | null
          subtotal_cents: number
          total_cents: number
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string | null
          utm_source: string | null
        }
        Insert: {
          buyer_cognome: string
          buyer_email: string
          buyer_nome: string
          buyer_telefono?: string | null
          consenso_marketing?: boolean | null
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          note_cliente?: string | null
          numero_ordine: string
          ship_address_line1: string
          ship_address_line2?: string | null
          ship_city: string
          ship_country?: string
          ship_postal_code: string
          ship_state?: string | null
          shipped_at?: string | null
          shipping_cents?: number
          status?: Database["public"]["Enums"]["order_status_enum"] | null
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          subtotal_cents: number
          total_cents: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string | null
          utm_source?: string | null
        }
        Update: {
          buyer_cognome?: string
          buyer_email?: string
          buyer_nome?: string
          buyer_telefono?: string | null
          consenso_marketing?: boolean | null
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          note_cliente?: string | null
          numero_ordine?: string
          ship_address_line1?: string
          ship_address_line2?: string | null
          ship_city?: string
          ship_country?: string
          ship_postal_code?: string
          ship_state?: string | null
          shipped_at?: string | null
          shipping_cents?: number
          status?: Database["public"]["Enums"]["order_status_enum"] | null
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          subtotal_cents?: number
          total_cents?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      posts: {
        Row: {
          autore_id: string | null
          contenuto_mdx: string
          copertina_url: string | null
          created_at: string | null
          id: string
          meta_description: string | null
          meta_title: string | null
          pubblicato: boolean | null
          pubblicato_at: string | null
          slug: string
          sommario: string | null
          tags: string[] | null
          titolo: string
          updated_at: string | null
        }
        Insert: {
          autore_id?: string | null
          contenuto_mdx: string
          copertina_url?: string | null
          created_at?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          pubblicato?: boolean | null
          pubblicato_at?: string | null
          slug: string
          sommario?: string | null
          tags?: string[] | null
          titolo: string
          updated_at?: string | null
        }
        Update: {
          autore_id?: string | null
          contenuto_mdx?: string
          copertina_url?: string | null
          created_at?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          pubblicato?: boolean | null
          pubblicato_at?: string | null
          slug?: string
          sommario?: string | null
          tags?: string[] | null
          titolo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_autore_id_fkey"
            columns: ["autore_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_plans: {
        Row: {
          attivo: boolean | null
          created_at: string | null
          cta_label: string | null
          cta_url: string | null
          descrizione: string | null
          features: string[] | null
          id: string
          in_evidenza: boolean | null
          ordine_display: number | null
          periodo: string
          prezzo_cents: number
          slug: string
          titolo: string
          valuta: string | null
        }
        Insert: {
          attivo?: boolean | null
          created_at?: string | null
          cta_label?: string | null
          cta_url?: string | null
          descrizione?: string | null
          features?: string[] | null
          id?: string
          in_evidenza?: boolean | null
          ordine_display?: number | null
          periodo: string
          prezzo_cents: number
          slug: string
          titolo: string
          valuta?: string | null
        }
        Update: {
          attivo?: boolean | null
          created_at?: string | null
          cta_label?: string | null
          cta_url?: string | null
          descrizione?: string | null
          features?: string[] | null
          id?: string
          in_evidenza?: boolean | null
          ordine_display?: number | null
          periodo?: string
          prezzo_cents?: number
          slug?: string
          titolo?: string
          valuta?: string | null
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          attivo: boolean | null
          colore: string | null
          colore_hex: string | null
          created_at: string | null
          id: string
          immagini_urls: string[] | null
          ordine_display: number | null
          prezzo_cents: number | null
          product_id: string | null
          sku: string
          stock: number
          stock_alert_threshold: number | null
          stripe_price_id: string | null
          taglia: string | null
        }
        Insert: {
          attivo?: boolean | null
          colore?: string | null
          colore_hex?: string | null
          created_at?: string | null
          id?: string
          immagini_urls?: string[] | null
          ordine_display?: number | null
          prezzo_cents?: number | null
          product_id?: string | null
          sku: string
          stock?: number
          stock_alert_threshold?: number | null
          stripe_price_id?: string | null
          taglia?: string | null
        }
        Update: {
          attivo?: boolean | null
          colore?: string | null
          colore_hex?: string | null
          created_at?: string | null
          id?: string
          immagini_urls?: string[] | null
          ordine_display?: number | null
          prezzo_cents?: number | null
          product_id?: string | null
          sku?: string
          stock?: number
          stock_alert_threshold?: number | null
          stripe_price_id?: string | null
          taglia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          categoria: Database["public"]["Enums"]["product_categoria_enum"]
          copertina_url: string | null
          created_at: string | null
          descrizione_breve: string | null
          descrizione_lunga: string | null
          id: string
          immagini_urls: string[] | null
          in_evidenza: boolean | null
          in_vendita: boolean | null
          meta_description: string | null
          meta_title: string | null
          nome: string
          ordine_display: number | null
          peso_grammi: number | null
          prezzo_base_cents: number
          slug: string
          sottocategoria: string | null
          updated_at: string | null
        }
        Insert: {
          categoria: Database["public"]["Enums"]["product_categoria_enum"]
          copertina_url?: string | null
          created_at?: string | null
          descrizione_breve?: string | null
          descrizione_lunga?: string | null
          id?: string
          immagini_urls?: string[] | null
          in_evidenza?: boolean | null
          in_vendita?: boolean | null
          meta_description?: string | null
          meta_title?: string | null
          nome: string
          ordine_display?: number | null
          peso_grammi?: number | null
          prezzo_base_cents: number
          slug: string
          sottocategoria?: string | null
          updated_at?: string | null
        }
        Update: {
          categoria?: Database["public"]["Enums"]["product_categoria_enum"]
          copertina_url?: string | null
          created_at?: string | null
          descrizione_breve?: string | null
          descrizione_lunga?: string | null
          id?: string
          immagini_urls?: string[] | null
          in_evidenza?: boolean | null
          in_vendita?: boolean | null
          meta_description?: string | null
          meta_title?: string | null
          nome?: string
          ordine_display?: number | null
          peso_grammi?: number | null
          prezzo_base_cents?: number
          slug?: string
          sottocategoria?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["role_enum"]
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["role_enum"]
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["role_enum"]
        }
        Relationships: []
      }
      schedule_slots: {
        Row: {
          attivo: boolean | null
          course_id: string | null
          created_at: string | null
          giorno: Database["public"]["Enums"]["weekday_enum"]
          id: string
          indirizzo: string | null
          istruttore_id: string | null
          note: string | null
          ora_fine: string
          ora_inizio: string
          sede: string
          valido_da: string | null
          valido_fino: string | null
        }
        Insert: {
          attivo?: boolean | null
          course_id?: string | null
          created_at?: string | null
          giorno: Database["public"]["Enums"]["weekday_enum"]
          id?: string
          indirizzo?: string | null
          istruttore_id?: string | null
          note?: string | null
          ora_fine: string
          ora_inizio: string
          sede?: string
          valido_da?: string | null
          valido_fino?: string | null
        }
        Update: {
          attivo?: boolean | null
          course_id?: string | null
          created_at?: string | null
          giorno?: Database["public"]["Enums"]["weekday_enum"]
          id?: string
          indirizzo?: string | null
          istruttore_id?: string | null
          note?: string | null
          ora_fine?: string
          ora_inizio?: string
          sede?: string
          valido_da?: string | null
          valido_fino?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_slots_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slots_istruttore_id_fkey"
            columns: ["istruttore_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_methods: {
        Row: {
          attivo: boolean | null
          descrizione: string | null
          giorni_consegna_max: number | null
          giorni_consegna_min: number | null
          id: string
          nome: string
          ordine_display: number | null
          prezzo_cents: number
          slug: string
          soglia_gratis_cents: number | null
        }
        Insert: {
          attivo?: boolean | null
          descrizione?: string | null
          giorni_consegna_max?: number | null
          giorni_consegna_min?: number | null
          id?: string
          nome: string
          ordine_display?: number | null
          prezzo_cents: number
          slug: string
          soglia_gratis_cents?: number | null
        }
        Update: {
          attivo?: boolean | null
          descrizione?: string | null
          giorni_consegna_max?: number | null
          giorni_consegna_min?: number | null
          id?: string
          nome?: string
          ordine_display?: number | null
          prezzo_cents?: number
          slug?: string
          soglia_gratis_cents?: number | null
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          created_at: string | null
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          created_at?: string | null
          key: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          created_at?: string | null
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      sponsors: {
        Row: {
          attivo: boolean | null
          created_at: string | null
          descrizione: string | null
          id: string
          link: string | null
          logo_url: string
          nome: string
          ordine_display: number | null
          slug: string
          tier: string | null
        }
        Insert: {
          attivo?: boolean | null
          created_at?: string | null
          descrizione?: string | null
          id?: string
          link?: string | null
          logo_url: string
          nome: string
          ordine_display?: number | null
          slug: string
          tier?: string | null
        }
        Update: {
          attivo?: boolean | null
          created_at?: string | null
          descrizione?: string | null
          id?: string
          link?: string | null
          logo_url?: string
          nome?: string
          ordine_display?: number | null
          slug?: string
          tier?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          bio: string | null
          cognome: string
          created_at: string | null
          email: string | null
          foto_url: string | null
          id: string
          instagram: string | null
          is_direttivo: boolean | null
          is_istruttore: boolean | null
          nome: string
          ordine_display: number | null
          ruolo: string
          slug: string
        }
        Insert: {
          bio?: string | null
          cognome: string
          created_at?: string | null
          email?: string | null
          foto_url?: string | null
          id?: string
          instagram?: string | null
          is_direttivo?: boolean | null
          is_istruttore?: boolean | null
          nome: string
          ordine_display?: number | null
          ruolo: string
          slug: string
        }
        Update: {
          bio?: string | null
          cognome?: string
          created_at?: string | null
          email?: string | null
          foto_url?: string | null
          id?: string
          instagram?: string | null
          is_direttivo?: boolean | null
          is_istruttore?: boolean | null
          nome?: string
          ordine_display?: number | null
          ruolo?: string
          slug?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          amount_cents: number | null
          buyer_cognome: string | null
          buyer_email: string
          buyer_nome: string | null
          buyer_telefono: string | null
          created_at: string | null
          event_id: string | null
          id: string
          qr_code: string | null
          status: Database["public"]["Enums"]["ticket_status_enum"] | null
          stripe_payment_intent: string | null
          stripe_session_id: string | null
          used_at: string | null
        }
        Insert: {
          amount_cents?: number | null
          buyer_cognome?: string | null
          buyer_email: string
          buyer_nome?: string | null
          buyer_telefono?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          qr_code?: string | null
          status?: Database["public"]["Enums"]["ticket_status_enum"] | null
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          used_at?: string | null
        }
        Update: {
          amount_cents?: number | null
          buyer_cognome?: string | null
          buyer_email?: string
          buyer_nome?: string | null
          buyer_telefono?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          qr_code?: string | null
          status?: Database["public"]["Enums"]["ticket_status_enum"] | null
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decrement_stock: {
        Args: { quantity_to_subtract: number; variant_id: string }
        Returns: undefined
      }
      generate_order_number: { Args: never; Returns: string }
      increment_ticket_count: { Args: { row_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      document_type_enum:
        | "mog"
        | "codice_condotta"
        | "segnalazione"
        | "regolamento"
        | "altro"
      event_tipo_enum: "evento" | "masterclass" | "workshop"
      lead_status_enum: "nuovo" | "contattato" | "convertito" | "archiviato"
      order_status_enum:
        | "pending"
        | "paid"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "refunded"
      product_categoria_enum: "abbigliamento" | "accessori" | "altro"
      role_enum: "admin" | "editor" | "viewer"
      ticket_status_enum: "pending" | "paid" | "used" | "refunded"
      weekday_enum: "lun" | "mar" | "mer" | "gio" | "ven" | "sab" | "dom"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      document_type_enum: [
        "mog",
        "codice_condotta",
        "segnalazione",
        "regolamento",
        "altro",
      ],
      event_tipo_enum: ["evento", "masterclass", "workshop"],
      lead_status_enum: ["nuovo", "contattato", "convertito", "archiviato"],
      order_status_enum: [
        "pending",
        "paid",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      product_categoria_enum: ["abbigliamento", "accessori", "altro"],
      role_enum: ["admin", "editor", "viewer"],
      ticket_status_enum: ["pending", "paid", "used", "refunded"],
      weekday_enum: ["lun", "mar", "mer", "gio", "ven", "sab", "dom"],
    },
  },
} as const

