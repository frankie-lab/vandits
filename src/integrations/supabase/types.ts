export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      achievement_definitions: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string
          icon: string
          id: string
          is_active: boolean
          levels: Json
          metric_type: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          description: string
          icon?: string
          id?: string
          is_active?: boolean
          levels?: Json
          metric_type: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          is_active?: boolean
          levels?: Json
          metric_type?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      admin_area_names: {
        Row: {
          area_id: string
          confidence: number | null
          created_at: string
          id: string
          language: string
          name: string
          name_kind: string
          source: string | null
          updated_at: string
        }
        Insert: {
          area_id: string
          confidence?: number | null
          created_at?: string
          id?: string
          language: string
          name: string
          name_kind?: string
          source?: string | null
          updated_at?: string
        }
        Update: {
          area_id?: string
          confidence?: number | null
          created_at?: string
          id?: string
          language?: string
          name?: string
          name_kind?: string
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_area_names_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "admin_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_areas: {
        Row: {
          admin_type_local: string | null
          aliases: string[]
          centroid_lat: number | null
          centroid_lng: number | null
          confidence: number | null
          created_at: string
          depth: number
          geonames_id: number | null
          id: string
          is_placeholder: boolean
          iso_code: string | null
          iso_code_alpha3: string | null
          m49_code: number | null
          name: string
          name_lang: string | null
          name_translations: Json
          osm_id: number | null
          parent_id: string | null
          path: string[]
          source: string | null
          timezone: string | null
          type_id: string
          updated_at: string
          wikidata_id: string | null
        }
        Insert: {
          admin_type_local?: string | null
          aliases?: string[]
          centroid_lat?: number | null
          centroid_lng?: number | null
          confidence?: number | null
          created_at?: string
          depth?: number
          geonames_id?: number | null
          id?: string
          is_placeholder?: boolean
          iso_code?: string | null
          iso_code_alpha3?: string | null
          m49_code?: number | null
          name: string
          name_lang?: string | null
          name_translations?: Json
          osm_id?: number | null
          parent_id?: string | null
          path?: string[]
          source?: string | null
          timezone?: string | null
          type_id: string
          updated_at?: string
          wikidata_id?: string | null
        }
        Update: {
          admin_type_local?: string | null
          aliases?: string[]
          centroid_lat?: number | null
          centroid_lng?: number | null
          confidence?: number | null
          created_at?: string
          depth?: number
          geonames_id?: number | null
          id?: string
          is_placeholder?: boolean
          iso_code?: string | null
          iso_code_alpha3?: string | null
          m49_code?: number | null
          name?: string
          name_lang?: string | null
          name_translations?: Json
          osm_id?: number | null
          parent_id?: string | null
          path?: string[]
          source?: string | null
          timezone?: string | null
          type_id?: string
          updated_at?: string
          wikidata_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_areas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "admin_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_areas_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "place_types"
            referencedColumns: ["id"]
          },
        ]
      }
      airports: {
        Row: {
          continent: string | null
          created_at: string
          elevation_ft: number | null
          iata_code: string | null
          id: string
          ident: string
          iso_country: string | null
          iso_region: string | null
          latitude: number
          longitude: number
          municipality: string | null
          name: string
          scheduled_service: boolean
          type: string
          wikipedia_link: string | null
        }
        Insert: {
          continent?: string | null
          created_at?: string
          elevation_ft?: number | null
          iata_code?: string | null
          id?: string
          ident: string
          iso_country?: string | null
          iso_region?: string | null
          latitude: number
          longitude: number
          municipality?: string | null
          name: string
          scheduled_service?: boolean
          type?: string
          wikipedia_link?: string | null
        }
        Update: {
          continent?: string | null
          created_at?: string
          elevation_ft?: number | null
          iata_code?: string | null
          id?: string
          ident?: string
          iso_country?: string | null
          iso_region?: string | null
          latitude?: number
          longitude?: number
          municipality?: string | null
          name?: string
          scheduled_service?: boolean
          type?: string
          wikipedia_link?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      collection_items: {
        Row: {
          added_at: string
          collection_id: string
          id: string
          item_id: string
          item_type: Database["public"]["Enums"]["collection_item_type"]
          position: number
        }
        Insert: {
          added_at?: string
          collection_id: string
          id?: string
          item_id: string
          item_type: Database["public"]["Enums"]["collection_item_type"]
          position?: number
        }
        Update: {
          added_at?: string
          collection_id?: string
          id?: string
          item_id?: string
          item_type?: Database["public"]["Enums"]["collection_item_type"]
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          in_catalog: boolean
          name: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          in_catalog?: boolean
          name: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          in_catalog?: boolean
          name?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      cost_categories: {
        Row: {
          code: string
          created_at: string
          description: string | null
          icon: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      document_tracks: {
        Row: {
          color: string | null
          coordinates: Json
          created_at: string
          date: string | null
          document_id: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          coordinates?: Json
          created_at?: string
          date?: string | null
          document_id: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          coordinates?: Json
          created_at?: string
          date?: string | null
          document_id?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_tracks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          confirmed_at: string | null
          conflict_count: number
          created_at: string
          id: string
          import_status:
            | Database["public"]["Enums"]["document_import_status"]
            | null
          metadata: Json
          name: string
          original_file_path: string | null
          original_filename: string | null
          pending_count: number
          resolved_count: number
          source_type:
            | Database["public"]["Enums"]["document_source_type"]
            | null
          status: Database["public"]["Enums"]["document_status"]
          total_waypoints: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          confirmed_at?: string | null
          conflict_count?: number
          created_at?: string
          id?: string
          import_status?:
            | Database["public"]["Enums"]["document_import_status"]
            | null
          metadata?: Json
          name: string
          original_file_path?: string | null
          original_filename?: string | null
          pending_count?: number
          resolved_count?: number
          source_type?:
            | Database["public"]["Enums"]["document_source_type"]
            | null
          status?: Database["public"]["Enums"]["document_status"]
          total_waypoints?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          confirmed_at?: string | null
          conflict_count?: number
          created_at?: string
          id?: string
          import_status?:
            | Database["public"]["Enums"]["document_import_status"]
            | null
          metadata?: Json
          name?: string
          original_file_path?: string | null
          original_filename?: string | null
          pending_count?: number
          resolved_count?: number
          source_type?:
            | Database["public"]["Enums"]["document_source_type"]
            | null
          status?: Database["public"]["Enums"]["document_status"]
          total_waypoints?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      enrichment_criteria: {
        Row: {
          description_tone: string
          id: string
          image_min_resolution: string
          image_sources: string[]
          min_description_length: number
          min_tags_count: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          description_tone?: string
          id?: string
          image_min_resolution?: string
          image_sources?: string[]
          min_description_length?: number
          min_tags_count?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          description_tone?: string
          id?: string
          image_min_resolution?: string
          image_sources?: string[]
          min_description_length?: number
          min_tags_count?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      enrichment_jobs: {
        Row: {
          created_at: string
          current_location_id: string | null
          current_location_name: string | null
          document_id: string | null
          error_count: number
          error_ids: string[]
          error_messages: Json
          id: string
          location_ids: string[]
          processed_count: number
          processed_ids: string[]
          status: string
          total_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_location_id?: string | null
          current_location_name?: string | null
          document_id?: string | null
          error_count?: number
          error_ids?: string[]
          error_messages?: Json
          id?: string
          location_ids?: string[]
          processed_count?: number
          processed_ids?: string[]
          status?: string
          total_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_location_id?: string | null
          current_location_name?: string | null
          document_id?: string | null
          error_count?: number
          error_ids?: string[]
          error_messages?: Json
          id?: string
          location_ids?: string[]
          processed_count?: number
          processed_ids?: string[]
          status?: string
          total_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      ferry_routes: {
        Row: {
          created_at: string
          destination_country: string | null
          destination_lat: number
          destination_lng: number
          destination_port_name: string
          distance_km: number | null
          estimated_duration_minutes: number | null
          id: string
          is_active: boolean
          operators: string[] | null
          origin_country: string | null
          origin_lat: number
          origin_lng: number
          origin_port_name: string
          region: string | null
          route_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          destination_country?: string | null
          destination_lat: number
          destination_lng: number
          destination_port_name: string
          distance_km?: number | null
          estimated_duration_minutes?: number | null
          id?: string
          is_active?: boolean
          operators?: string[] | null
          origin_country?: string | null
          origin_lat: number
          origin_lng: number
          origin_port_name: string
          region?: string | null
          route_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          destination_country?: string | null
          destination_lat?: number
          destination_lng?: number
          destination_port_name?: string
          distance_km?: number | null
          estimated_duration_minutes?: number | null
          id?: string
          is_active?: boolean
          operators?: string[] | null
          origin_country?: string | null
          origin_lat?: number
          origin_lng?: number
          origin_port_name?: string
          region?: string | null
          route_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      follow_category_preferences: {
        Row: {
          classification_code: string
          created_at: string
          follow_id: string
          id: string
          visible: boolean
        }
        Insert: {
          classification_code: string
          created_at?: string
          follow_id: string
          id?: string
          visible?: boolean
        }
        Update: {
          classification_code?: string
          created_at?: string
          follow_id?: string
          id?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "follow_category_preferences_follow_id_fkey"
            columns: ["follow_id"]
            isOneToOne: false
            referencedRelation: "follows"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
          status: Database["public"]["Enums"]["follow_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
          status?: Database["public"]["Enums"]["follow_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
          status?: Database["public"]["Enums"]["follow_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      geocoding_jobs: {
        Row: {
          admin_scope: Json | null
          catalog_only: boolean
          created_at: string
          created_by: string | null
          document_id: string | null
          failed: number
          id: string
          label: string | null
          last_error: string | null
          last_tick_at: string | null
          location_ids: string[] | null
          mode: string
          offset: number
          page_size: number
          processed: number
          remaining: number | null
          scope: Json
          status: Database["public"]["Enums"]["geocoding_job_status"]
          total_in_scope: number | null
          updated: number
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_scope?: Json | null
          catalog_only?: boolean
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          failed?: number
          id?: string
          label?: string | null
          last_error?: string | null
          last_tick_at?: string | null
          location_ids?: string[] | null
          mode?: string
          offset?: number
          page_size?: number
          processed?: number
          remaining?: number | null
          scope?: Json
          status?: Database["public"]["Enums"]["geocoding_job_status"]
          total_in_scope?: number | null
          updated?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_scope?: Json | null
          catalog_only?: boolean
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          failed?: number
          id?: string
          label?: string | null
          last_error?: string | null
          last_tick_at?: string | null
          location_ids?: string[] | null
          mode?: string
          offset?: number
          page_size?: number
          processed?: number
          remaining?: number | null
          scope?: Json
          status?: Database["public"]["Enums"]["geocoding_job_status"]
          total_in_scope?: number | null
          updated?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      global_enrichment_jobs: {
        Row: {
          created_at: string
          criteria_version: number
          error_count: number
          id: string
          processed_count: number
          status: string
          total_count: number
          triggered_by: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criteria_version: number
          error_count?: number
          id?: string
          processed_count?: number
          status?: string
          total_count?: number
          triggered_by: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criteria_version?: number
          error_count?: number
          id?: string
          processed_count?: number
          status?: string
          total_count?: number
          triggered_by?: string
          updated_at?: string
        }
        Relationships: []
      }
      location_geo_provenance: {
        Row: {
          area_id: string | null
          confidence: number | null
          field_type: string
          id: string
          location_id: string
          normalized_language: string | null
          normalized_value: string | null
          original_language: string | null
          original_value: string | null
          resolved_at: string
          source: string | null
        }
        Insert: {
          area_id?: string | null
          confidence?: number | null
          field_type: string
          id?: string
          location_id: string
          normalized_language?: string | null
          normalized_value?: string | null
          original_language?: string | null
          original_value?: string | null
          resolved_at?: string
          source?: string | null
        }
        Update: {
          area_id?: string | null
          confidence?: number | null
          field_type?: string
          id?: string
          location_id?: string
          normalized_language?: string | null
          normalized_value?: string | null
          original_language?: string | null
          original_value?: string | null
          resolved_at?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_geo_provenance_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "admin_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_geo_provenance_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_geo_provenance_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_geo_health"
            referencedColumns: ["id"]
          },
        ]
      }
      location_notes: {
        Row: {
          content: string
          created_at: string
          id: string
          location_id: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          location_id: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          location_id?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_notes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_notes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_geo_health"
            referencedColumns: ["id"]
          },
        ]
      }
      location_photos: {
        Row: {
          caption: string | null
          created_at: string | null
          id: string
          image_url: string
          is_primary: boolean | null
          location_id: string
          updated_at: string | null
          user_id: string
          visibility: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          id?: string
          image_url: string
          is_primary?: boolean | null
          location_id: string
          updated_at?: string | null
          user_id: string
          visibility?: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          id?: string
          image_url?: string
          is_primary?: boolean | null
          location_id?: string
          updated_at?: string | null
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_photos_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_photos_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_geo_health"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          admin1_iso: string | null
          admin3_id: string | null
          altitude: number | null
          continent: string | null
          continent_id: string | null
          country: string | null
          country_code: string | null
          country_id: string | null
          created_at: string
          custom_data: Json | null
          deleted_at: string | null
          description: string | null
          document_id: string | null
          enriched_data: Json | null
          enrichment_status: string | null
          geo_confidence: number | null
          geo_health: string | null
          geo_resolved_at: string | null
          geo_source: string | null
          id: string
          is_approved: boolean
          latitude: number
          locality_id: string | null
          longitude: number
          name: string
          owner_user_id: string | null
          personal_category_id: string | null
          pioneer_user_id: string | null
          place_type: string | null
          postal_code: string | null
          raw_geocode: Json | null
          region: string | null
          region_id: string | null
          street_name: string | null
          sublocality_id: string | null
          timezone: string | null
          type_id: string | null
          updated_at: string
          user_image_url: string | null
          user_image_visibility: string | null
          visibility: string
          zone: string | null
          zone_id: string | null
        }
        Insert: {
          admin1_iso?: string | null
          admin3_id?: string | null
          altitude?: number | null
          continent?: string | null
          continent_id?: string | null
          country?: string | null
          country_code?: string | null
          country_id?: string | null
          created_at?: string
          custom_data?: Json | null
          deleted_at?: string | null
          description?: string | null
          document_id?: string | null
          enriched_data?: Json | null
          enrichment_status?: string | null
          geo_confidence?: number | null
          geo_health?: string | null
          geo_resolved_at?: string | null
          geo_source?: string | null
          id?: string
          is_approved?: boolean
          latitude: number
          locality_id?: string | null
          longitude: number
          name: string
          owner_user_id?: string | null
          personal_category_id?: string | null
          pioneer_user_id?: string | null
          place_type?: string | null
          postal_code?: string | null
          raw_geocode?: Json | null
          region?: string | null
          region_id?: string | null
          street_name?: string | null
          sublocality_id?: string | null
          timezone?: string | null
          type_id?: string | null
          updated_at?: string
          user_image_url?: string | null
          user_image_visibility?: string | null
          visibility?: string
          zone?: string | null
          zone_id?: string | null
        }
        Update: {
          admin1_iso?: string | null
          admin3_id?: string | null
          altitude?: number | null
          continent?: string | null
          continent_id?: string | null
          country?: string | null
          country_code?: string | null
          country_id?: string | null
          created_at?: string
          custom_data?: Json | null
          deleted_at?: string | null
          description?: string | null
          document_id?: string | null
          enriched_data?: Json | null
          enrichment_status?: string | null
          geo_confidence?: number | null
          geo_health?: string | null
          geo_resolved_at?: string | null
          geo_source?: string | null
          id?: string
          is_approved?: boolean
          latitude?: number
          locality_id?: string | null
          longitude?: number
          name?: string
          owner_user_id?: string | null
          personal_category_id?: string | null
          pioneer_user_id?: string | null
          place_type?: string | null
          postal_code?: string | null
          raw_geocode?: Json | null
          region?: string | null
          region_id?: string | null
          street_name?: string | null
          sublocality_id?: string | null
          timezone?: string | null
          type_id?: string | null
          updated_at?: string
          user_image_url?: string | null
          user_image_visibility?: string | null
          visibility?: string
          zone?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_admin3_id_fkey"
            columns: ["admin3_id"]
            isOneToOne: false
            referencedRelation: "admin_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_continent_id_fkey"
            columns: ["continent_id"]
            isOneToOne: false
            referencedRelation: "admin_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "admin_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_locality_id_fkey"
            columns: ["locality_id"]
            isOneToOne: false
            referencedRelation: "admin_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_personal_category_id_fkey"
            columns: ["personal_category_id"]
            isOneToOne: false
            referencedRelation: "personal_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "admin_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_sublocality_id_fkey"
            columns: ["sublocality_id"]
            isOneToOne: false
            referencedRelation: "admin_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "place_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "admin_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      marker_size_config: {
        Row: {
          base_focused: number
          base_normal: number
          base_recent: number
          base_selected: number
          created_at: string
          fill_color: string
          fill_color_light: string
          hover_size: number | null
          id: string
          marker_shape: string
          marker_type: string
          updated_at: string
        }
        Insert: {
          base_focused?: number
          base_normal?: number
          base_recent?: number
          base_selected?: number
          created_at?: string
          fill_color?: string
          fill_color_light?: string
          hover_size?: number | null
          id?: string
          marker_shape?: string
          marker_type: string
          updated_at?: string
        }
        Update: {
          base_focused?: number
          base_normal?: number
          base_recent?: number
          base_selected?: number
          created_at?: string
          fill_color?: string
          fill_color_light?: string
          hover_size?: number | null
          id?: string
          marker_shape?: string
          marker_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      onedrive_photo_index: {
        Row: {
          altitude: number | null
          camera_make: string | null
          camera_model: string | null
          created_at: string
          folder_path: string | null
          id: string
          latitude: number
          longitude: number
          name: string
          onedrive_id: string
          taken_at: string | null
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          altitude?: number | null
          camera_make?: string | null
          camera_model?: string | null
          created_at?: string
          folder_path?: string | null
          id?: string
          latitude: number
          longitude: number
          name: string
          onedrive_id: string
          taken_at?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          altitude?: number | null
          camera_make?: string | null
          camera_model?: string | null
          created_at?: string
          folder_path?: string | null
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          onedrive_id?: string
          taken_at?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      personal_categories: {
        Row: {
          color: string
          created_at: string
          description: string | null
          icon: string
          id: string
          is_shared: boolean
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          is_shared?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          is_shared?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      place_merge_history: {
        Row: {
          id: string
          merged_at: string
          merged_by: string | null
          reason: string | null
          source_place_id: string
          target_place_id: string
        }
        Insert: {
          id?: string
          merged_at?: string
          merged_by?: string | null
          reason?: string | null
          source_place_id: string
          target_place_id: string
        }
        Update: {
          id?: string
          merged_at?: string
          merged_by?: string | null
          reason?: string | null
          source_place_id?: string
          target_place_id?: string
        }
        Relationships: []
      }
      place_types: {
        Row: {
          category: string
          code: string
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          parent_type_id: string | null
          sort_admin_level: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_type_id?: string | null
          sort_admin_level?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_type_id?: string | null
          sort_admin_level?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_types_parent_type_id_fkey"
            columns: ["parent_type_id"]
            isOneToOne: false
            referencedRelation: "place_types"
            referencedColumns: ["id"]
          },
        ]
      }
      place_types_i18n: {
        Row: {
          code: string
          created_at: string
          label: string
          language: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          label: string
          language: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          label?: string
          language?: string
          updated_at?: string
        }
        Relationships: []
      }
      places: {
        Row: {
          altitude: number | null
          classification: Json | null
          continent: string | null
          country: string | null
          created_at: string
          created_by: string | null
          enriched_data: Json | null
          id: string
          latitude: number
          longitude: number
          name: string
          place_type: string | null
          region: string | null
          updated_at: string
          zone: string | null
        }
        Insert: {
          altitude?: number | null
          classification?: Json | null
          continent?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          enriched_data?: Json | null
          id?: string
          latitude: number
          longitude: number
          name: string
          place_type?: string | null
          region?: string | null
          updated_at?: string
          zone?: string | null
        }
        Update: {
          altitude?: number | null
          classification?: Json | null
          continent?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          enriched_data?: Json | null
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          place_type?: string | null
          region?: string | null
          updated_at?: string
          zone?: string | null
        }
        Relationships: []
      }
      places_trunk: {
        Row: {
          created_at: string
          enriched_at: string
          enriched_data: Json
          first_enriched_by: string | null
          id: string
          last_refreshed_at: string
          lat_bucket: number | null
          latitude: number
          lng_bucket: number | null
          longitude: number
          name_canonical: string
          place_type: string | null
          refresh_count: number
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          enriched_at?: string
          enriched_data: Json
          first_enriched_by?: string | null
          id?: string
          last_refreshed_at?: string
          lat_bucket?: number | null
          latitude: number
          lng_bucket?: number | null
          longitude: number
          name_canonical: string
          place_type?: string | null
          refresh_count?: number
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          enriched_at?: string
          enriched_data?: Json
          first_enriched_by?: string | null
          id?: string
          last_refreshed_at?: string
          lat_bucket?: number | null
          latitude?: number
          lng_bucket?: number | null
          longitude?: number
          name_canonical?: string
          place_type?: string | null
          refresh_count?: number
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      preference_values: {
        Row: {
          id: string
          scope_id: string | null
          scope_type: string
          unit_key: string
          updated_at: string
          values: Json
        }
        Insert: {
          id?: string
          scope_id?: string | null
          scope_type: string
          unit_key: string
          updated_at?: string
          values?: Json
        }
        Update: {
          id?: string
          scope_id?: string | null
          scope_type?: string
          unit_key?: string
          updated_at?: string
          values?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          default_location_visibility: string
          default_note_visibility: string
          default_photo_visibility: string | null
          display_name: string | null
          duplicate_threshold_meters: number
          hide_home_location: boolean
          home_latitude: number | null
          home_longitude: number | null
          home_name: string | null
          icon_library: string
          id: string
          is_private: boolean
          language: string
          language_fallback: string
          map_center_mode: string
          measurement_units: string
          priority_ranking: Json | null
          route_engine_defaults: Json | null
          travel_profile: string
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          default_location_visibility?: string
          default_note_visibility?: string
          default_photo_visibility?: string | null
          display_name?: string | null
          duplicate_threshold_meters?: number
          hide_home_location?: boolean
          home_latitude?: number | null
          home_longitude?: number | null
          home_name?: string | null
          icon_library?: string
          id: string
          is_private?: boolean
          language?: string
          language_fallback?: string
          map_center_mode?: string
          measurement_units?: string
          priority_ranking?: Json | null
          route_engine_defaults?: Json | null
          travel_profile?: string
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          default_location_visibility?: string
          default_note_visibility?: string
          default_photo_visibility?: string | null
          display_name?: string | null
          duplicate_threshold_meters?: number
          hide_home_location?: boolean
          home_latitude?: number | null
          home_longitude?: number | null
          home_name?: string | null
          icon_library?: string
          id?: string
          is_private?: boolean
          language?: string
          language_fallback?: string
          map_center_mode?: string
          measurement_units?: string
          priority_ranking?: Json | null
          route_engine_defaults?: Json | null
          travel_profile?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission: Database["public"]["Enums"]["app_permission"]
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          permission: Database["public"]["Enums"]["app_permission"]
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          permission?: Database["public"]["Enums"]["app_permission"]
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      route_analyses: {
        Row: {
          budget_max: number | null
          created_at: string
          excluded_modes: string[] | null
          id: string
          profile_code: string
          route_id: string | null
          time_max_hours: number | null
          user_id: string
          weights_snapshot: Json
        }
        Insert: {
          budget_max?: number | null
          created_at?: string
          excluded_modes?: string[] | null
          id?: string
          profile_code: string
          route_id?: string | null
          time_max_hours?: number | null
          user_id: string
          weights_snapshot?: Json
        }
        Update: {
          budget_max?: number | null
          created_at?: string
          excluded_modes?: string[] | null
          id?: string
          profile_code?: string
          route_id?: string | null
          time_max_hours?: number | null
          user_id?: string
          weights_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "route_analyses_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      route_analysis_alternatives: {
        Row: {
          analysis_id: string
          cost_breakdown: Json
          created_at: string
          explanation: string | null
          id: string
          modes_used: string[] | null
          name: string
          rank: number
          scores: Json
          segments: Json
          total_cost: number
          total_distance_km: number
          total_time_hours: number
        }
        Insert: {
          analysis_id: string
          cost_breakdown?: Json
          created_at?: string
          explanation?: string | null
          id?: string
          modes_used?: string[] | null
          name: string
          rank?: number
          scores?: Json
          segments?: Json
          total_cost?: number
          total_distance_km?: number
          total_time_hours?: number
        }
        Update: {
          analysis_id?: string
          cost_breakdown?: Json
          created_at?: string
          explanation?: string | null
          id?: string
          modes_used?: string[] | null
          name?: string
          rank?: number
          scores?: Json
          segments?: Json
          total_cost?: number
          total_distance_km?: number
          total_time_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "route_analysis_alternatives_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "route_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      route_day_stages: {
        Row: {
          created_at: string
          day_number: number
          description: string | null
          distance_meters: number | null
          duration_seconds: number | null
          end_latitude: number
          end_longitude: number
          end_name: string
          id: string
          name: string
          overnight_stop_id: string | null
          route_id: string
          start_latitude: number
          start_longitude: number
          start_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_number?: number
          description?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          end_latitude: number
          end_longitude: number
          end_name: string
          id?: string
          name: string
          overnight_stop_id?: string | null
          route_id: string
          start_latitude: number
          start_longitude: number
          start_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_number?: number
          description?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          end_latitude?: number
          end_longitude?: number
          end_name?: string
          id?: string
          name?: string
          overnight_stop_id?: string | null
          route_id?: string
          start_latitude?: number
          start_longitude?: number
          start_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_day_stages_overnight_stop_id_fkey"
            columns: ["overnight_stop_id"]
            isOneToOne: false
            referencedRelation: "route_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_day_stages_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      route_stops: {
        Row: {
          arrival_estimate: string | null
          created_at: string
          departure_estimate: string | null
          description: string | null
          icon: string | null
          id: string
          latitude: number
          longitude: number
          metadata: Json | null
          name: string
          position: number
          route_id: string
          stop_type: Database["public"]["Enums"]["route_stop_type"]
          updated_at: string
        }
        Insert: {
          arrival_estimate?: string | null
          created_at?: string
          departure_estimate?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          latitude: number
          longitude: number
          metadata?: Json | null
          name: string
          position?: number
          route_id: string
          stop_type?: Database["public"]["Enums"]["route_stop_type"]
          updated_at?: string
        }
        Update: {
          arrival_estimate?: string | null
          created_at?: string
          departure_estimate?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          latitude?: number
          longitude?: number
          metadata?: Json | null
          name?: string
          position?: number
          route_id?: string
          stop_type?: Database["public"]["Enums"]["route_stop_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      route_waypoints: {
        Row: {
          created_at: string
          id: string
          latitude: number
          location_id: string | null
          longitude: number
          name: string
          position: number
          route_id: string
          segment_distance_meters: number | null
          segment_duration_seconds: number | null
          segment_geometry: Json | null
          transport_mode: Database["public"]["Enums"]["transport_mode"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          latitude: number
          location_id?: string | null
          longitude: number
          name: string
          position: number
          route_id: string
          segment_distance_meters?: number | null
          segment_duration_seconds?: number | null
          segment_geometry?: Json | null
          transport_mode?: Database["public"]["Enums"]["transport_mode"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number
          location_id?: string | null
          longitude?: number
          name?: string
          position?: number
          route_id?: string
          segment_distance_meters?: number | null
          segment_duration_seconds?: number | null
          segment_geometry?: Json | null
          transport_mode?: Database["public"]["Enums"]["transport_mode"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_waypoints_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_waypoints_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_geo_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_waypoints_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          parent_route_id: string | null
          road_preference: string
          route_geometry: Json | null
          route_preferences: Json | null
          segment_position: number | null
          status: Database["public"]["Enums"]["route_status"]
          total_distance_meters: number | null
          total_duration_seconds: number | null
          transport_mode: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_route_id?: string | null
          road_preference?: string
          route_geometry?: Json | null
          route_preferences?: Json | null
          segment_position?: number | null
          status?: Database["public"]["Enums"]["route_status"]
          total_distance_meters?: number | null
          total_duration_seconds?: number | null
          transport_mode?: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_route_id?: string | null
          road_preference?: string
          route_geometry?: Json | null
          route_preferences?: Json | null
          segment_position?: number | null
          status?: Database["public"]["Enums"]["route_status"]
          total_distance_meters?: number | null
          total_duration_seconds?: number | null
          transport_mode?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_parent_route_id_fkey"
            columns: ["parent_route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_job_items: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          id: string
          job_id: string
          location_id: string | null
          processed_at: string | null
          status: Database["public"]["Enums"]["scrape_item_status"]
          url: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          job_id: string
          location_id?: string | null
          processed_at?: string | null
          status?: Database["public"]["Enums"]["scrape_item_status"]
          url: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string
          location_id?: string | null
          processed_at?: string | null
          status?: Database["public"]["Enums"]["scrape_item_status"]
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "scrape_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_job_pages: {
        Row: {
          created_at: string
          error: string | null
          id: string
          job_id: string
          page_number: number
          processed_at: string | null
          status: Database["public"]["Enums"]["scrape_page_status"]
          url: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          job_id: string
          page_number?: number
          processed_at?: string | null
          status?: Database["public"]["Enums"]["scrape_page_status"]
          url: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string
          page_number?: number
          processed_at?: string | null
          status?: Database["public"]["Enums"]["scrape_page_status"]
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_job_pages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "scrape_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_jobs: {
        Row: {
          auto_enrich: boolean
          created_at: string
          default_visibility: string
          document_id: string | null
          error_message: string | null
          id: string
          items_found: number
          items_imported: number
          items_lost: number
          items_skipped: number
          items_until_pause: number
          last_tick_at: string | null
          max_items: number | null
          max_tick_seconds: number
          min_tick_seconds: number
          new_collection_name: string | null
          next_tick_at: string
          pages_seen: number
          pause_after_max: number
          pause_after_min: number
          pause_duration_max_minutes: number
          pause_duration_min_minutes: number
          paused_until: string | null
          rate_per_tick: number
          seed_url: string
          source: string
          status: Database["public"]["Enums"]["scrape_job_status"]
          target_collection_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_enrich?: boolean
          created_at?: string
          default_visibility?: string
          document_id?: string | null
          error_message?: string | null
          id?: string
          items_found?: number
          items_imported?: number
          items_lost?: number
          items_skipped?: number
          items_until_pause?: number
          last_tick_at?: string | null
          max_items?: number | null
          max_tick_seconds?: number
          min_tick_seconds?: number
          new_collection_name?: string | null
          next_tick_at?: string
          pages_seen?: number
          pause_after_max?: number
          pause_after_min?: number
          pause_duration_max_minutes?: number
          pause_duration_min_minutes?: number
          paused_until?: string | null
          rate_per_tick?: number
          seed_url: string
          source: string
          status?: Database["public"]["Enums"]["scrape_job_status"]
          target_collection_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_enrich?: boolean
          created_at?: string
          default_visibility?: string
          document_id?: string | null
          error_message?: string | null
          id?: string
          items_found?: number
          items_imported?: number
          items_lost?: number
          items_skipped?: number
          items_until_pause?: number
          last_tick_at?: string | null
          max_items?: number | null
          max_tick_seconds?: number
          min_tick_seconds?: number
          new_collection_name?: string | null
          next_tick_at?: string
          pages_seen?: number
          pause_after_max?: number
          pause_after_min?: number
          pause_duration_max_minutes?: number
          pause_duration_min_minutes?: number
          paused_until?: string | null
          rate_per_tick?: number
          seed_url?: string
          source?: string
          status?: Database["public"]["Enums"]["scrape_job_status"]
          target_collection_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_jobs_target_collection_id_fkey"
            columns: ["target_collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_mode_compatibility: {
        Row: {
          carried_code: string
          carrier_code: string
          created_at: string
          id: string
          is_compatible: boolean
          notes: string | null
        }
        Insert: {
          carried_code: string
          carrier_code: string
          created_at?: string
          id?: string
          is_compatible?: boolean
          notes?: string | null
        }
        Update: {
          carried_code?: string
          carrier_code?: string
          created_at?: string
          id?: string
          is_compatible?: boolean
          notes?: string | null
        }
        Relationships: []
      }
      transport_mode_costs: {
        Row: {
          api_source: string | null
          base_cost: number
          cost_category_id: string
          cost_per_km: number
          created_at: string
          id: string
          is_estimated: boolean
          notes: string | null
          transport_mode_id: string
          updated_at: string
        }
        Insert: {
          api_source?: string | null
          base_cost?: number
          cost_category_id: string
          cost_per_km?: number
          created_at?: string
          id?: string
          is_estimated?: boolean
          notes?: string | null
          transport_mode_id: string
          updated_at?: string
        }
        Update: {
          api_source?: string | null
          base_cost?: number
          cost_category_id?: string
          cost_per_km?: number
          created_at?: string
          id?: string
          is_estimated?: boolean
          notes?: string | null
          transport_mode_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_mode_costs_cost_category_id_fkey"
            columns: ["cost_category_id"]
            isOneToOne: false
            referencedRelation: "cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_mode_costs_transport_mode_id_fkey"
            columns: ["transport_mode_id"]
            isOneToOne: false
            referencedRelation: "transport_modes"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_modes: {
        Row: {
          allows_cargo: boolean
          avg_speed_kmh: number
          base_cost: number
          category: string
          code: string
          cost_per_km: number
          created_at: string
          height_m: number | null
          icon: string
          id: string
          is_active: boolean
          is_complementary: boolean
          is_motorized: boolean
          length_m: number | null
          max_passengers: number
          max_range_km: number | null
          name: string
          notes: string | null
          overhead_minutes: number
          requires_booking: boolean
          requires_license: string[] | null
          requires_schedule: boolean
          score_autonomy: number
          score_cargo: number
          score_comfort: number
          score_flexibility: number
          score_load_capacity: number
          score_restrictions: number
          score_risk: number
          score_scenic: number
          setup_time_minutes: number
          sub_category: string
          supports_sleep: boolean
          updated_at: string
          weight_kg: number | null
          width_m: number | null
        }
        Insert: {
          allows_cargo?: boolean
          avg_speed_kmh?: number
          base_cost?: number
          category?: string
          code: string
          cost_per_km?: number
          created_at?: string
          height_m?: number | null
          icon?: string
          id?: string
          is_active?: boolean
          is_complementary?: boolean
          is_motorized?: boolean
          length_m?: number | null
          max_passengers?: number
          max_range_km?: number | null
          name: string
          notes?: string | null
          overhead_minutes?: number
          requires_booking?: boolean
          requires_license?: string[] | null
          requires_schedule?: boolean
          score_autonomy?: number
          score_cargo?: number
          score_comfort?: number
          score_flexibility?: number
          score_load_capacity?: number
          score_restrictions?: number
          score_risk?: number
          score_scenic?: number
          setup_time_minutes?: number
          sub_category?: string
          supports_sleep?: boolean
          updated_at?: string
          weight_kg?: number | null
          width_m?: number | null
        }
        Update: {
          allows_cargo?: boolean
          avg_speed_kmh?: number
          base_cost?: number
          category?: string
          code?: string
          cost_per_km?: number
          created_at?: string
          height_m?: number | null
          icon?: string
          id?: string
          is_active?: boolean
          is_complementary?: boolean
          is_motorized?: boolean
          length_m?: number | null
          max_passengers?: number
          max_range_km?: number | null
          name?: string
          notes?: string | null
          overhead_minutes?: number
          requires_booking?: boolean
          requires_license?: string[] | null
          requires_schedule?: boolean
          score_autonomy?: number
          score_cargo?: number
          score_comfort?: number
          score_flexibility?: number
          score_load_capacity?: number
          score_restrictions?: number
          score_risk?: number
          score_scenic?: number
          setup_time_minutes?: number
          sub_category?: string
          supports_sleep?: boolean
          updated_at?: string
          weight_kg?: number | null
          width_m?: number | null
        }
        Relationships: []
      }
      travel_profiles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          icon: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          weight_autonomy: number
          weight_comfort: number
          weight_cost: number
          weight_flexibility: number
          weight_load: number
          weight_restrictions: number
          weight_risk: number
          weight_scenic: number
          weight_time: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          weight_autonomy?: number
          weight_comfort?: number
          weight_cost?: number
          weight_flexibility?: number
          weight_load?: number
          weight_restrictions?: number
          weight_risk?: number
          weight_scenic?: number
          weight_time?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          weight_autonomy?: number
          weight_comfort?: number
          weight_cost?: number
          weight_flexibility?: number
          weight_load?: number
          weight_restrictions?: number
          weight_risk?: number
          weight_scenic?: number
          weight_time?: number
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_code: string
          current_level: number
          id: string
          progress_count: number
          unlocked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          achievement_code: string
          current_level?: number
          id?: string
          progress_count?: number
          unlocked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          achievement_code?: string
          current_level?: number
          id?: string
          progress_count?: number
          unlocked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_code_fkey"
            columns: ["achievement_code"]
            isOneToOne: false
            referencedRelation: "achievement_definitions"
            referencedColumns: ["code"]
          },
        ]
      }
      user_map_preferences: {
        Row: {
          active_filters: Json
          context: Database["public"]["Enums"]["map_context_type"]
          id: string
          updated_at: string
          user_id: string
          viewport: Json
          visible_layers: Json
        }
        Insert: {
          active_filters?: Json
          context: Database["public"]["Enums"]["map_context_type"]
          id?: string
          updated_at?: string
          user_id: string
          viewport?: Json
          visible_layers?: Json
        }
        Update: {
          active_filters?: Json
          context?: Database["public"]["Enums"]["map_context_type"]
          id?: string
          updated_at?: string
          user_id?: string
          viewport?: Json
          visible_layers?: Json
        }
        Relationships: []
      }
      user_places: {
        Row: {
          created_at: string
          id: string
          is_archived: boolean
          is_favorite: boolean
          is_saved: boolean
          origin: Database["public"]["Enums"]["user_place_origin"]
          place_id: string
          rating: number | null
          saved_from_user_id: string | null
          source_document_id: string | null
          updated_at: string
          user_id: string
          visibility: string
          visit_status: Database["public"]["Enums"]["visit_status_type"]
          visited_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_archived?: boolean
          is_favorite?: boolean
          is_saved?: boolean
          origin?: Database["public"]["Enums"]["user_place_origin"]
          place_id: string
          rating?: number | null
          saved_from_user_id?: string | null
          source_document_id?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
          visit_status?: Database["public"]["Enums"]["visit_status_type"]
          visited_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_archived?: boolean
          is_favorite?: boolean
          is_saved?: boolean
          origin?: Database["public"]["Enums"]["user_place_origin"]
          place_id?: string
          rating?: number | null
          saved_from_user_id?: string | null
          source_document_id?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
          visit_status?: Database["public"]["Enums"]["visit_status_type"]
          visited_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_places_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_places_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_stats_cache: {
        Row: {
          classification_distribution: Json
          completed_routes: number
          computed_at: string
          continents_count: number
          countries_count: number
          created_at: string
          duplicate_candidates: number
          enriched_locations: number
          followers_count: number
          following_count: number
          geo_distribution: Json
          id: string
          monthly_activity: Json
          pending_locations: number
          public_locations_count: number
          recent_activity: Json
          regions_count: number
          top_rated_locations: Json
          total_distance_km: number
          total_duration_hours: number
          total_locations: number
          total_routes: number
          transport_mode_distribution: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          classification_distribution?: Json
          completed_routes?: number
          computed_at?: string
          continents_count?: number
          countries_count?: number
          created_at?: string
          duplicate_candidates?: number
          enriched_locations?: number
          followers_count?: number
          following_count?: number
          geo_distribution?: Json
          id?: string
          monthly_activity?: Json
          pending_locations?: number
          public_locations_count?: number
          recent_activity?: Json
          regions_count?: number
          top_rated_locations?: Json
          total_distance_km?: number
          total_duration_hours?: number
          total_locations?: number
          total_routes?: number
          transport_mode_distribution?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          classification_distribution?: Json
          completed_routes?: number
          computed_at?: string
          continents_count?: number
          countries_count?: number
          created_at?: string
          duplicate_candidates?: number
          enriched_locations?: number
          followers_count?: number
          following_count?: number
          geo_distribution?: Json
          id?: string
          monthly_activity?: Json
          pending_locations?: number
          public_locations_count?: number
          recent_activity?: Json
          regions_count?: number
          top_rated_locations?: Json
          total_distance_km?: number
          total_duration_hours?: number
          total_locations?: number
          total_routes?: number
          transport_mode_distribution?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_transport_modes: {
        Row: {
          created_at: string
          custom_height_m: number | null
          custom_length_m: number | null
          custom_weight_kg: number | null
          custom_width_m: number | null
          id: string
          is_available: boolean
          layer: string
          notes: string | null
          preference: string
          transport_mode_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_height_m?: number | null
          custom_length_m?: number | null
          custom_weight_kg?: number | null
          custom_width_m?: number | null
          id?: string
          is_available?: boolean
          layer?: string
          notes?: string | null
          preference?: string
          transport_mode_code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_height_m?: number | null
          custom_length_m?: number | null
          custom_weight_kg?: number | null
          custom_width_m?: number | null
          id?: string
          is_available?: boolean
          layer?: string
          notes?: string | null
          preference?: string
          transport_mode_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      waypoints: {
        Row: {
          created_at: string
          document_id: string
          enrichment_status: string | null
          id: string
          latitude: number
          longitude: number
          normalized_name: string
          place_id: string | null
          raw_name: string
          resolution_confidence: number | null
          resolution_method:
            | Database["public"]["Enums"]["waypoint_resolution_method"]
            | null
          resolution_status: Database["public"]["Enums"]["waypoint_resolution_status"]
          resolved_at: string | null
          resolved_by_user_id: string | null
          source_hash: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id: string
          enrichment_status?: string | null
          id?: string
          latitude: number
          longitude: number
          normalized_name?: string
          place_id?: string | null
          raw_name: string
          resolution_confidence?: number | null
          resolution_method?:
            | Database["public"]["Enums"]["waypoint_resolution_method"]
            | null
          resolution_status?: Database["public"]["Enums"]["waypoint_resolution_status"]
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          source_hash?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          enrichment_status?: string | null
          id?: string
          latitude?: number
          longitude?: number
          normalized_name?: string
          place_id?: string | null
          raw_name?: string
          resolution_confidence?: number | null
          resolution_method?:
            | Database["public"]["Enums"]["waypoint_resolution_method"]
            | null
          resolution_status?: Database["public"]["Enums"]["waypoint_resolution_status"]
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          source_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waypoints_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waypoints_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_geo_coverage: {
        Row: {
          avg_confidence: number | null
          resolved: number | null
          total: number | null
          user_id: string | null
          with_admin1: number | null
          with_country: number | null
          with_postal: number | null
          with_timezone: number | null
        }
        Relationships: []
      }
      v_location_geo_health: {
        Row: {
          continent: string | null
          continent_id: string | null
          country: string | null
          country_code: string | null
          country_id: string | null
          document_id: string | null
          health: string | null
          id: string | null
          latitude: number | null
          longitude: number | null
          name: string | null
          owner_user_id: string | null
          place_type: string | null
          region: string | null
          region_id: string | null
          zone: string | null
          zone_id: string | null
        }
        Insert: {
          continent?: string | null
          continent_id?: string | null
          country?: string | null
          country_code?: string | null
          country_id?: string | null
          document_id?: string | null
          health?: string | null
          id?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          owner_user_id?: string | null
          place_type?: string | null
          region?: string | null
          region_id?: string | null
          zone?: string | null
          zone_id?: string | null
        }
        Update: {
          continent?: string | null
          continent_id?: string | null
          country?: string | null
          country_code?: string | null
          country_id?: string | null
          document_id?: string | null
          health?: string | null
          id?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          owner_user_id?: string | null
          place_type?: string | null
          region?: string | null
          region_id?: string | null
          zone?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_continent_id_fkey"
            columns: ["continent_id"]
            isOneToOne: false
            referencedRelation: "admin_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "admin_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "admin_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "admin_areas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _collapse_admin_duplicates: {
        Args: { _parent_id: string }
        Returns: number
      }
      _compute_location_geo_health: {
        Args: {
          _c_iso: string
          _c_name: string
          _c_parent: string
          _continent_id: string
          _country_code: string
          _country_id: string
          _country_str: string
          _lat: number
          _lng: number
          _r_name: string
          _r_parent: string
          _region_id: string
          _region_str: string
          _z_name: string
          _z_parent: string
          _zone_id: string
          _zone_str: string
        }
        Returns: string
      }
      _compute_location_geo_health_lookup: {
        Args: {
          _continent_id: string
          _country_code: string
          _country_id: string
          _country_str: string
          _lat: number
          _lng: number
          _region_id: string
          _region_str: string
          _zone_id: string
          _zone_str: string
        }
        Returns: string
      }
      _is_admin_or_master: { Args: { _uid: string }; Returns: boolean }
      _merge_admin_area: {
        Args: { _canonical: string; _orphan: string }
        Returns: undefined
      }
      _reclassify_admin_area: {
        Args: { _new_parent: string; _new_type: string; _node_id: string }
        Returns: undefined
      }
      admin_broken_locations_for_user:
        | {
            Args: { _user_id: string }
            Returns: {
              admin3_id: string
              continent: string
              continent_id: string
              country: string
              country_code: string
              country_id: string
              id: string
              latitude: number
              locality_id: string
              longitude: number
              name: string
              place_type: string
              region: string
              region_id: string
              sublocality_id: string
              zone: string
              zone_id: string
            }[]
          }
        | {
            Args: { _limit?: number; _offset?: number; _user_id: string }
            Returns: {
              admin3_id: string
              continent: string
              continent_id: string
              country: string
              country_code: string
              country_id: string
              id: string
              latitude: number
              locality_id: string
              longitude: number
              name: string
              place_type: string
              region: string
              region_id: string
              sublocality_id: string
              zone: string
              zone_id: string
            }[]
          }
      admin_geo_coverage: {
        Args: { _user_id: string }
        Returns: {
          avg_confidence: number
          resolved: number
          total: number
          with_admin1: number
          with_country: number
          with_postal: number
          with_timezone: number
        }[]
      }
      admin_user_geo_locations: {
        Args: {
          _continent?: string
          _country?: string
          _health_filter?: string[]
          _limit?: number
          _offset?: number
          _region?: string
          _user_id: string
          _zone?: string
        }
        Returns: {
          continent: string
          country: string
          health: string
          id: string
          latitude: number
          longitude: number
          name: string
          place_type: string
          region: string
          zone: string
        }[]
      }
      admin_user_geo_scope_ids: {
        Args: {
          _continent?: string
          _country?: string
          _health_filter?: string[]
          _limit?: number
          _offset?: number
          _region?: string
          _user_id: string
          _zone?: string
        }
        Returns: {
          id: string
        }[]
      }
      admin_user_geo_summary: {
        Args: { _user_id: string }
        Returns: {
          broken: number
          empty: number
          ok: number
          partial: number
          stale_name: number
          total: number
        }[]
      }
      admin_user_geo_tree: {
        Args: { _health_filter?: string[]; _user_id: string }
        Returns: {
          broken: number
          continent: string
          country: string
          empty: number
          ok: number
          partial: number
          region: string
          stale_name: number
          total: number
          zone: string
        }[]
      }
      admin_users_geo_universe: {
        Args: { _health_filter?: string[] }
        Returns: {
          display_name: string
          total_locations: number
          universe_count: number
          user_id: string
          username: string
        }[]
      }
      admin_users_with_broken_geo_chain: {
        Args: never
        Returns: {
          broken_count: number
          display_name: string
          total_locations: number
          user_id: string
          username: string
        }[]
      }
      can_view_deleted_location: {
        Args: { loc_row: Database["public"]["Tables"]["locations"]["Row"] }
        Returns: boolean
      }
      can_view_location: {
        Args: { loc_row: Database["public"]["Tables"]["locations"]["Row"] }
        Returns: boolean
      }
      can_view_user_documents: {
        Args: { doc_user_id: string }
        Returns: boolean
      }
      cancel_geocoding_job: {
        Args: { _job_id: string }
        Returns: {
          new_status: string
          updated_count: number
        }[]
      }
      cleanup_old_deleted_locations: { Args: never; Returns: number }
      count_locations_with_broken_geo_chain: {
        Args: { _user_id: string }
        Returns: number
      }
      get_my_home: {
        Args: never
        Returns: {
          hide_home_location: boolean
          home_latitude: number
          home_longitude: number
          home_name: string
        }[]
      }
      get_profile_home: {
        Args: { _profile_id: string }
        Returns: {
          home_latitude: number
          home_longitude: number
          home_name: string
        }[]
      }
      get_public_profile_stats: {
        Args: never
        Returns: {
          followers_count: number
          following_count: number
          public_locations_count: number
          user_id: string
        }[]
      }
      get_user_permissions: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_permission"][]
      }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_permission: {
        Args: {
          _permission: Database["public"]["Enums"]["app_permission"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_curator: { Args: { _user_id: string }; Returns: boolean }
      locations_with_broken_geo_chain: {
        Args: { _limit?: number; _offset?: number; _user_id: string }
        Returns: {
          id: string
        }[]
      }
      lookup_trunk_place: {
        Args: {
          _latitude: number
          _longitude: number
          _max_distance_meters?: number
          _place_type?: string
        }
        Returns: {
          distance_meters: number
          enriched_at: string
          enriched_data: Json
          id: string
          is_fresh: boolean
          last_refreshed_at: string
          latitude: number
          longitude: number
          name_canonical: string
          place_type: string
        }[]
      }
      refresh_locations_admin_cache: { Args: never; Returns: number }
      refresh_user_stats: { Args: { _user_id: string }; Returns: undefined }
      upsert_trunk_place: {
        Args: {
          _enriched_by?: string
          _enriched_data: Json
          _latitude: number
          _longitude: number
          _name: string
          _place_type: string
        }
        Returns: string
      }
    }
    Enums: {
      app_permission:
        | "manage_users"
        | "manage_criteria"
        | "run_global_enrichment"
        | "view_all_locations"
        | "edit_all_locations"
        | "delete_any_location"
        | "manage_documents"
        | "view_analytics"
        | "moderate_content"
        | "upload_files"
        | "add_locations"
      app_role:
        | "master"
        | "admin"
        | "user"
        | "moderator"
        | "editor"
        | "supervisor"
        | "curator"
      collection_item_type: "place" | "waypoint" | "route"
      document_import_status:
        | "parsing"
        | "reviewing"
        | "confirmed"
        | "partial"
        | "failed"
        | "processing"
      document_source_type:
        | "kml"
        | "gpx"
        | "geojson"
        | "csv"
        | "manual"
        | "web_import"
      document_status: "draft" | "in_review" | "published"
      follow_status: "pending" | "accepted" | "rejected"
      geocoding_job_status:
        | "running"
        | "canceling"
        | "canceled"
        | "completed"
        | "failed"
      map_context_type: "personal" | "document" | "social"
      route_status: "draft" | "completed"
      route_stop_type:
        | "overnight"
        | "port"
        | "airport"
        | "refuel"
        | "rest"
        | "scenic"
        | "custom"
      scrape_item_status: "pending" | "done" | "skipped" | "error"
      scrape_job_status:
        | "queued"
        | "running"
        | "paused"
        | "done"
        | "error"
        | "cancelled"
      scrape_page_status: "pending" | "done" | "error"
      transport_mode: "walking" | "driving" | "flight" | "ferry"
      user_place_origin: "import" | "manual" | "adopted"
      visit_status_type: "not_visited" | "want_to_go" | "visited"
      waypoint_resolution_method: "auto" | "ai" | "manual"
      waypoint_resolution_status:
        | "pending"
        | "resolved"
        | "conflict"
        | "dismissed"
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
  public: {
    Enums: {
      app_permission: [
        "manage_users",
        "manage_criteria",
        "run_global_enrichment",
        "view_all_locations",
        "edit_all_locations",
        "delete_any_location",
        "manage_documents",
        "view_analytics",
        "moderate_content",
        "upload_files",
        "add_locations",
      ],
      app_role: [
        "master",
        "admin",
        "user",
        "moderator",
        "editor",
        "supervisor",
        "curator",
      ],
      collection_item_type: ["place", "waypoint", "route"],
      document_import_status: [
        "parsing",
        "reviewing",
        "confirmed",
        "partial",
        "failed",
        "processing",
      ],
      document_source_type: [
        "kml",
        "gpx",
        "geojson",
        "csv",
        "manual",
        "web_import",
      ],
      document_status: ["draft", "in_review", "published"],
      follow_status: ["pending", "accepted", "rejected"],
      geocoding_job_status: [
        "running",
        "canceling",
        "canceled",
        "completed",
        "failed",
      ],
      map_context_type: ["personal", "document", "social"],
      route_status: ["draft", "completed"],
      route_stop_type: [
        "overnight",
        "port",
        "airport",
        "refuel",
        "rest",
        "scenic",
        "custom",
      ],
      scrape_item_status: ["pending", "done", "skipped", "error"],
      scrape_job_status: [
        "queued",
        "running",
        "paused",
        "done",
        "error",
        "cancelled",
      ],
      scrape_page_status: ["pending", "done", "error"],
      transport_mode: ["walking", "driving", "flight", "ferry"],
      user_place_origin: ["import", "manual", "adopted"],
      visit_status_type: ["not_visited", "want_to_go", "visited"],
      waypoint_resolution_method: ["auto", "ai", "manual"],
      waypoint_resolution_status: [
        "pending",
        "resolved",
        "conflict",
        "dismissed",
      ],
    },
  },
} as const
