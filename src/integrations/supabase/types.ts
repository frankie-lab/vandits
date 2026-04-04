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
      curator_documents: {
        Row: {
          created_at: string
          curator_id: string
          document_id: string
          id: string
        }
        Insert: {
          created_at?: string
          curator_id: string
          document_id: string
          id?: string
        }
        Update: {
          created_at?: string
          curator_id?: string
          document_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curator_documents_curator_id_fkey"
            columns: ["curator_id"]
            isOneToOne: false
            referencedRelation: "curators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curator_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      curator_location_reviews: {
        Row: {
          comment: string | null
          confirmed_exists: boolean
          created_at: string
          id: string
          location_id: string
          rating: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          confirmed_exists?: boolean
          created_at?: string
          id?: string
          location_id: string
          rating?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          confirmed_exists?: boolean
          created_at?: string
          id?: string
          location_id?: string
          rating?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curator_location_reviews_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      curators: {
        Row: {
          avatar_url: string | null
          category: string | null
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          enrichment_correct_coordinates: boolean | null
          enrichment_custom_prompt: string | null
          enrichment_exclude_keywords: string[] | null
          enrichment_expected_nature: string | null
          enrichment_focus_keywords: string[] | null
          enrichment_include_contact: boolean | null
          enrichment_include_image: boolean | null
          enrichment_include_interest_index: boolean | null
          enrichment_include_tags: boolean | null
          enrichment_include_web: boolean | null
          enrichment_min_length: number | null
          enrichment_search_radius_meters: number | null
          enrichment_show_sources: boolean | null
          enrichment_tone: string | null
          icon: string | null
          id: string
          is_active: boolean
          min_visibility_zoom: number | null
          name: string
          updated_at: string
          validation_radius_meters: number | null
          visibility_radius_meters: number | null
        }
        Insert: {
          avatar_url?: string | null
          category?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enrichment_correct_coordinates?: boolean | null
          enrichment_custom_prompt?: string | null
          enrichment_exclude_keywords?: string[] | null
          enrichment_expected_nature?: string | null
          enrichment_focus_keywords?: string[] | null
          enrichment_include_contact?: boolean | null
          enrichment_include_image?: boolean | null
          enrichment_include_interest_index?: boolean | null
          enrichment_include_tags?: boolean | null
          enrichment_include_web?: boolean | null
          enrichment_min_length?: number | null
          enrichment_search_radius_meters?: number | null
          enrichment_show_sources?: boolean | null
          enrichment_tone?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          min_visibility_zoom?: number | null
          name: string
          updated_at?: string
          validation_radius_meters?: number | null
          visibility_radius_meters?: number | null
        }
        Update: {
          avatar_url?: string | null
          category?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enrichment_correct_coordinates?: boolean | null
          enrichment_custom_prompt?: string | null
          enrichment_exclude_keywords?: string[] | null
          enrichment_expected_nature?: string | null
          enrichment_focus_keywords?: string[] | null
          enrichment_include_contact?: boolean | null
          enrichment_include_image?: boolean | null
          enrichment_include_interest_index?: boolean | null
          enrichment_include_tags?: boolean | null
          enrichment_include_web?: boolean | null
          enrichment_min_length?: number | null
          enrichment_search_radius_meters?: number | null
          enrichment_show_sources?: boolean | null
          enrichment_tone?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          min_visibility_zoom?: number | null
          name?: string
          updated_at?: string
          validation_radius_meters?: number | null
          visibility_radius_meters?: number | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          id: string
          name: string
          original_filename: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          original_filename?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          original_filename?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      druid_locations: {
        Row: {
          created_at: string
          druid_id: string
          enriched_data: Json | null
          enrichment_status: string | null
          expires_at: string
          id: string
          latitude: number
          longitude: number
          name: string
          osm_data: Json | null
          osm_id: string | null
          osm_type: string | null
          place_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          druid_id: string
          enriched_data?: Json | null
          enrichment_status?: string | null
          expires_at: string
          id?: string
          latitude: number
          longitude: number
          name: string
          osm_data?: Json | null
          osm_id?: string | null
          osm_type?: string | null
          place_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          druid_id?: string
          enriched_data?: Json | null
          enrichment_status?: string | null
          expires_at?: string
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          osm_data?: Json | null
          osm_id?: string | null
          osm_type?: string | null
          place_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "druid_locations_druid_id_fkey"
            columns: ["druid_id"]
            isOneToOne: false
            referencedRelation: "druids"
            referencedColumns: ["id"]
          },
        ]
      }
      druids: {
        Row: {
          auto_enrich: boolean | null
          avatar_url: string | null
          category: string | null
          category_filter: string | null
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          enrichment_correct_coordinates: boolean | null
          enrichment_custom_prompt: string | null
          enrichment_exclude_keywords: string[] | null
          enrichment_expected_nature: string | null
          enrichment_focus_keywords: string[] | null
          enrichment_include_contact: boolean | null
          enrichment_include_image: boolean | null
          enrichment_include_interest_index: boolean | null
          enrichment_include_tags: boolean | null
          enrichment_include_web: boolean | null
          enrichment_min_length: number | null
          enrichment_search_radius_meters: number | null
          enrichment_show_sources: boolean | null
          enrichment_tone: string | null
          icon: string | null
          id: string
          is_active: boolean
          last_refresh_at: string | null
          max_results: number | null
          min_visibility_zoom: number | null
          name: string
          overpass_query: string | null
          refresh_interval_hours: number | null
          search_center_lat: number | null
          search_center_lng: number | null
          search_keywords: string[] | null
          search_radius_km: number | null
          updated_at: string
          visibility_radius_meters: number | null
        }
        Insert: {
          auto_enrich?: boolean | null
          avatar_url?: string | null
          category?: string | null
          category_filter?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enrichment_correct_coordinates?: boolean | null
          enrichment_custom_prompt?: string | null
          enrichment_exclude_keywords?: string[] | null
          enrichment_expected_nature?: string | null
          enrichment_focus_keywords?: string[] | null
          enrichment_include_contact?: boolean | null
          enrichment_include_image?: boolean | null
          enrichment_include_interest_index?: boolean | null
          enrichment_include_tags?: boolean | null
          enrichment_include_web?: boolean | null
          enrichment_min_length?: number | null
          enrichment_search_radius_meters?: number | null
          enrichment_show_sources?: boolean | null
          enrichment_tone?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          last_refresh_at?: string | null
          max_results?: number | null
          min_visibility_zoom?: number | null
          name: string
          overpass_query?: string | null
          refresh_interval_hours?: number | null
          search_center_lat?: number | null
          search_center_lng?: number | null
          search_keywords?: string[] | null
          search_radius_km?: number | null
          updated_at?: string
          visibility_radius_meters?: number | null
        }
        Update: {
          auto_enrich?: boolean | null
          avatar_url?: string | null
          category?: string | null
          category_filter?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enrichment_correct_coordinates?: boolean | null
          enrichment_custom_prompt?: string | null
          enrichment_exclude_keywords?: string[] | null
          enrichment_expected_nature?: string | null
          enrichment_focus_keywords?: string[] | null
          enrichment_include_contact?: boolean | null
          enrichment_include_image?: boolean | null
          enrichment_include_interest_index?: boolean | null
          enrichment_include_tags?: boolean | null
          enrichment_include_web?: boolean | null
          enrichment_min_length?: number | null
          enrichment_search_radius_meters?: number | null
          enrichment_show_sources?: boolean | null
          enrichment_tone?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          last_refresh_at?: string | null
          max_results?: number | null
          min_visibility_zoom?: number | null
          name?: string
          overpass_query?: string | null
          refresh_interval_hours?: number | null
          search_center_lat?: number | null
          search_center_lng?: number | null
          search_keywords?: string[] | null
          search_radius_km?: number | null
          updated_at?: string
          visibility_radius_meters?: number | null
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
          curator_id: string | null
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
          curator_id?: string | null
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
          curator_id?: string | null
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
            foreignKeyName: "enrichment_jobs_curator_id_fkey"
            columns: ["curator_id"]
            isOneToOne: false
            referencedRelation: "curators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
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
        ]
      }
      locations: {
        Row: {
          altitude: number | null
          continent: string | null
          country: string | null
          created_at: string
          custom_data: Json | null
          deleted_at: string | null
          description: string | null
          document_id: string | null
          enriched_data: Json | null
          id: string
          latitude: number
          longitude: number
          name: string
          pioneer_user_id: string | null
          place_type: string | null
          region: string | null
          updated_at: string
          user_image_url: string | null
          user_image_visibility: string | null
          visibility: string
          zone: string | null
        }
        Insert: {
          altitude?: number | null
          continent?: string | null
          country?: string | null
          created_at?: string
          custom_data?: Json | null
          deleted_at?: string | null
          description?: string | null
          document_id?: string | null
          enriched_data?: Json | null
          id?: string
          latitude: number
          longitude: number
          name: string
          pioneer_user_id?: string | null
          place_type?: string | null
          region?: string | null
          updated_at?: string
          user_image_url?: string | null
          user_image_visibility?: string | null
          visibility?: string
          zone?: string | null
        }
        Update: {
          altitude?: number | null
          continent?: string | null
          country?: string | null
          created_at?: string
          custom_data?: Json | null
          deleted_at?: string | null
          description?: string | null
          document_id?: string | null
          enriched_data?: Json | null
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          pioneer_user_id?: string | null
          place_type?: string | null
          region?: string | null
          updated_at?: string
          user_image_url?: string | null
          user_image_visibility?: string | null
          visibility?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          curator_category: string | null
          curator_color: string | null
          curator_description: string | null
          curator_icon: string | null
          default_location_visibility: string
          default_note_visibility: string
          default_photo_visibility: string | null
          display_name: string | null
          duplicate_threshold_meters: number
          hide_home_location: boolean
          home_latitude: number | null
          home_longitude: number | null
          home_name: string | null
          id: string
          is_private: boolean
          map_center_mode: string
          measurement_units: string
          travel_profile: string
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          curator_category?: string | null
          curator_color?: string | null
          curator_description?: string | null
          curator_icon?: string | null
          default_location_visibility?: string
          default_note_visibility?: string
          default_photo_visibility?: string | null
          display_name?: string | null
          duplicate_threshold_meters?: number
          hide_home_location?: boolean
          home_latitude?: number | null
          home_longitude?: number | null
          home_name?: string | null
          id: string
          is_private?: boolean
          map_center_mode?: string
          measurement_units?: string
          travel_profile?: string
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          curator_category?: string | null
          curator_color?: string | null
          curator_description?: string | null
          curator_icon?: string | null
          default_location_visibility?: string
          default_note_visibility?: string
          default_photo_visibility?: string | null
          display_name?: string | null
          duplicate_threshold_meters?: number
          hide_home_location?: boolean
          home_latitude?: number | null
          home_longitude?: number | null
          home_name?: string | null
          id?: string
          is_private?: boolean
          map_center_mode?: string
          measurement_units?: string
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
          route_geometry: Json | null
          status: Database["public"]["Enums"]["route_status"]
          total_distance_meters: number | null
          total_duration_seconds: number | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          route_geometry?: Json | null
          status?: Database["public"]["Enums"]["route_status"]
          total_distance_meters?: number | null
          total_duration_seconds?: number | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          route_geometry?: Json | null
          status?: Database["public"]["Enums"]["route_status"]
          total_distance_meters?: number | null
          total_duration_seconds?: number | null
          updated_at?: string
          user_id?: string
          visibility?: string
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
          icon: string
          id: string
          is_active: boolean
          is_motorized: boolean
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
          supports_sleep: boolean
          updated_at: string
        }
        Insert: {
          allows_cargo?: boolean
          avg_speed_kmh?: number
          base_cost?: number
          category?: string
          code: string
          cost_per_km?: number
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          is_motorized?: boolean
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
          supports_sleep?: boolean
          updated_at?: string
        }
        Update: {
          allows_cargo?: boolean
          avg_speed_kmh?: number
          base_cost?: number
          category?: string
          code?: string
          cost_per_km?: number
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          is_motorized?: boolean
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
          supports_sleep?: boolean
          updated_at?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      cleanup_old_deleted_locations: { Args: never; Returns: number }
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
      is_curator_location: {
        Args: { loc_row: Database["public"]["Tables"]["locations"]["Row"] }
        Returns: boolean
      }
      is_virtual_curator_location: {
        Args: { loc_row: Database["public"]["Tables"]["locations"]["Row"] }
        Returns: boolean
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
      follow_status: "pending" | "accepted" | "rejected"
      route_status: "draft" | "completed"
      transport_mode: "walking" | "driving" | "flight" | "ferry"
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
      follow_status: ["pending", "accepted", "rejected"],
      route_status: ["draft", "completed"],
      transport_mode: ["walking", "driving", "flight", "ferry"],
    },
  },
} as const
