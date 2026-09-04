/**
 * Hand-written database types for Phase 1. Mirrors supabase/migrations/.
 * Regenerate with `supabase gen types typescript` once the CLI is in play.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      watchlist_items: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          company_name: string | null;
          thesis: string | null;
          target_price: number | null;
          added_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string; // defaults to auth.jwt()->>'sub'
          symbol: string;
          company_name?: string | null;
          thesis?: string | null;
          target_price?: number | null;
          added_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          symbol?: string;
          company_name?: string | null;
          thesis?: string | null;
          target_price?: number | null;
          added_at?: string;
        };
        Relationships: [];
      };
      market_snapshots: {
        Row: {
          id: string;
          symbol: string;
          price: number;
          volume: number | null;
          source: string;
          fetched_at: string;
          status: string;
        };
        Insert: {
          id?: string;
          symbol: string;
          price: number;
          volume?: number | null;
          source: string;
          fetched_at?: string;
          status?: string;
        };
        Update: {
          id?: string;
          symbol?: string;
          price?: number;
          volume?: number | null;
          source?: string;
          fetched_at?: string;
          status?: string;
        };
        Relationships: [];
      };
      user_seen_state: {
        Row: {
          user_id: string;
          symbol: string;
          last_seen_snapshot_id: string | null;
          seen_at: string;
        };
        Insert: {
          user_id?: string; // defaults to auth.jwt()->>'sub'
          symbol: string;
          last_seen_snapshot_id?: string | null;
          seen_at?: string;
        };
        Update: {
          user_id?: string;
          symbol?: string;
          last_seen_snapshot_id?: string | null;
          seen_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_seen_state_last_seen_snapshot_id_fkey";
            columns: ["last_seen_snapshot_id"];
            referencedRelation: "market_snapshots";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_history: {
        Row: {
          symbol: string;
          date: string;
          close: number;
          volume: number | null;
        };
        Insert: {
          symbol: string;
          date: string;
          close: number;
          volume?: number | null;
        };
        Update: {
          symbol?: string;
          date?: string;
          close?: number;
          volume?: number | null;
        };
        Relationships: [];
      };
      change_events: {
        Row: {
          id: string;
          user_id: string;
          symbol: string;
          detected_at: string;
          snapshot_id: string | null;
          meaningfulness_score: number | null;
          magnitude: number | null;
          confidence: string | null;
          explanation: Json | null;
          thesis_verdict: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string; // defaults to auth.jwt()->>'sub'
          symbol: string;
          detected_at?: string;
          snapshot_id?: string | null;
          meaningfulness_score?: number | null;
          magnitude?: number | null;
          confidence?: string | null;
          explanation?: Json | null;
          thesis_verdict?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          symbol?: string;
          detected_at?: string;
          snapshot_id?: string | null;
          meaningfulness_score?: number | null;
          magnitude?: number | null;
          confidence?: string | null;
          explanation?: Json | null;
          thesis_verdict?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "change_events_snapshot_id_fkey";
            columns: ["snapshot_id"];
            referencedRelation: "market_snapshots";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
