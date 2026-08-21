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
      academic_years: {
        Row: {
          created_at: string
          end_date: string
          id: string
          name: string
          school_id: string
          start_date: string
          status: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          name: string
          school_id: string
          start_date: string
          status?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          school_id?: string
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      admission_applications: {
        Row: {
          academic_year_id: string
          applicant_name: string
          applicant_note: string | null
          area: string | null
          assigned_to: string | null
          class_applied_id: string
          converted_at: string | null
          converted_student_id: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          docs_note: string | null
          docs_reviewed: boolean
          entrance_test_score: number | null
          fee_amount: number
          gender: string | null
          id: string
          internal_notes: string | null
          parent_email: string | null
          parent_name: string
          parent_phone: string
          payment_status: Database["public"]["Enums"]["admission_payment_status"]
          previous_school: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          reference_no: string
          rejection_reason: string | null
          school_id: string
          source: Database["public"]["Enums"]["admission_source"]
          stage: Database["public"]["Enums"]["admission_stage"]
          submit_ip: unknown
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          applicant_name: string
          applicant_note?: string | null
          area?: string | null
          assigned_to?: string | null
          class_applied_id: string
          converted_at?: string | null
          converted_student_id?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          docs_note?: string | null
          docs_reviewed?: boolean
          entrance_test_score?: number | null
          fee_amount?: number
          gender?: string | null
          id?: string
          internal_notes?: string | null
          parent_email?: string | null
          parent_name: string
          parent_phone: string
          payment_status?: Database["public"]["Enums"]["admission_payment_status"]
          previous_school?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          reference_no: string
          rejection_reason?: string | null
          school_id: string
          source?: Database["public"]["Enums"]["admission_source"]
          stage?: Database["public"]["Enums"]["admission_stage"]
          submit_ip?: unknown
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          applicant_name?: string
          applicant_note?: string | null
          area?: string | null
          assigned_to?: string | null
          class_applied_id?: string
          converted_at?: string | null
          converted_student_id?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          docs_note?: string | null
          docs_reviewed?: boolean
          entrance_test_score?: number | null
          fee_amount?: number
          gender?: string | null
          id?: string
          internal_notes?: string | null
          parent_email?: string | null
          parent_name?: string
          parent_phone?: string
          payment_status?: Database["public"]["Enums"]["admission_payment_status"]
          previous_school?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          reference_no?: string
          rejection_reason?: string | null
          school_id?: string
          source?: Database["public"]["Enums"]["admission_source"]
          stage?: Database["public"]["Enums"]["admission_stage"]
          submit_ip?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admission_applications_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_applications_class_applied_id_fkey"
            columns: ["class_applied_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_applications_converted_student_id_fkey"
            columns: ["converted_student_id"]
            isOneToOne: false
            referencedRelation: "student_kyc_completeness"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "admission_applications_converted_student_id_fkey"
            columns: ["converted_student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_applications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      admission_settings: {
        Row: {
          admission_academic_year_id: string | null
          application_fee: number
          is_open: boolean
          next_ref_seq: number
          school_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          admission_academic_year_id?: string | null
          application_fee?: number
          is_open?: boolean
          next_ref_seq?: number
          school_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          admission_academic_year_id?: string | null
          application_fee?: number
          is_open?: boolean
          next_ref_seq?: number
          school_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_settings_admission_academic_year_id_fkey"
            columns: ["admission_academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      admission_stage_events: {
        Row: {
          actor_id: string | null
          application_id: string
          created_at: string
          from_stage: Database["public"]["Enums"]["admission_stage"] | null
          id: string
          note: string | null
          school_id: string
          to_stage: Database["public"]["Enums"]["admission_stage"]
        }
        Insert: {
          actor_id?: string | null
          application_id: string
          created_at?: string
          from_stage?: Database["public"]["Enums"]["admission_stage"] | null
          id?: string
          note?: string | null
          school_id: string
          to_stage: Database["public"]["Enums"]["admission_stage"]
        }
        Update: {
          actor_id?: string | null
          application_id?: string
          created_at?: string
          from_stage?: Database["public"]["Enums"]["admission_stage"] | null
          id?: string
          note?: string | null
          school_id?: string
          to_stage?: Database["public"]["Enums"]["admission_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "admission_stage_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "admission_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          academic_year_id: string | null
          attachment_url: string | null
          content: string
          created_at: string
          created_by: string
          id: string
          school_id: string
          target_id: string | null
          target_type: Database["public"]["Enums"]["announcement_target_type"]
          title: string
        }
        Insert: {
          academic_year_id?: string | null
          attachment_url?: string | null
          content: string
          created_at?: string
          created_by: string
          id?: string
          school_id: string
          target_id?: string | null
          target_type?: Database["public"]["Enums"]["announcement_target_type"]
          title: string
        }
        Update: {
          academic_year_id?: string | null
          attachment_url?: string | null
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          school_id?: string
          target_id?: string | null
          target_type?: Database["public"]["Enums"]["announcement_target_type"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          academic_year_id: string | null
          captured_lat: number | null
          captured_lng: number | null
          created_at: string
          date: string
          geo_distance_m: number | null
          geo_reviewed_at: string | null
          geo_reviewed_by: string | null
          geo_status: Database["public"]["Enums"]["geo_status"] | null
          gps_accuracy_m: number | null
          id: string
          marked_by: string
          matched_geofence_id: string | null
          notified_at: string | null
          school_id: string
          section_id: string
          session: Database["public"]["Enums"]["attendance_session"]
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
        }
        Insert: {
          academic_year_id?: string | null
          captured_lat?: number | null
          captured_lng?: number | null
          created_at?: string
          date: string
          geo_distance_m?: number | null
          geo_reviewed_at?: string | null
          geo_reviewed_by?: string | null
          geo_status?: Database["public"]["Enums"]["geo_status"] | null
          gps_accuracy_m?: number | null
          id?: string
          marked_by: string
          matched_geofence_id?: string | null
          notified_at?: string | null
          school_id: string
          section_id: string
          session?: Database["public"]["Enums"]["attendance_session"]
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
        }
        Update: {
          academic_year_id?: string | null
          captured_lat?: number | null
          captured_lng?: number | null
          created_at?: string
          date?: string
          geo_distance_m?: number | null
          geo_reviewed_at?: string | null
          geo_reviewed_by?: string | null
          geo_status?: Database["public"]["Enums"]["geo_status"] | null
          gps_accuracy_m?: number | null
          id?: string
          marked_by?: string
          matched_geofence_id?: string | null
          notified_at?: string | null
          school_id?: string
          section_id?: string
          session?: Database["public"]["Enums"]["attendance_session"]
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_matched_geofence_id_fkey"
            columns: ["matched_geofence_id"]
            isOneToOne: false
            referencedRelation: "school_geofences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_kyc_completeness"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          acting_as_role: Database["public"]["Enums"]["app_role"]
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          performed_by: string
          school_id: string | null
        }
        Insert: {
          acting_as_role: Database["public"]["Enums"]["app_role"]
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          performed_by: string
          school_id?: string | null
        }
        Update: {
          acting_as_role?: Database["public"]["Enums"]["app_role"]
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          performed_by?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      bonafide_certificates: {
        Row: {
          academic_year_id: string
          generated_at: string
          generated_by: string
          id: string
          school_id: string
          student_profile_id: string
        }
        Insert: {
          academic_year_id: string
          generated_at?: string
          generated_by: string
          id?: string
          school_id: string
          student_profile_id: string
        }
        Update: {
          academic_year_id?: string
          generated_at?: string
          generated_by?: string
          id?: string
          school_id?: string
          student_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonafide_certificates_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonafide_certificates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonafide_certificates_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_kyc_completeness"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "bonafide_certificates_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          id: string
          name: string
          order: number
          school_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order?: number
          school_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          order?: number
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      discipline_records: {
        Row: {
          academic_year_id: string | null
          category: Database["public"]["Enums"]["discipline_category"]
          created_at: string
          description: string
          id: string
          parent_notified: boolean
          recorded_by: string
          school_id: string
          severity: Database["public"]["Enums"]["discipline_severity"]
          student_id: string
        }
        Insert: {
          academic_year_id?: string | null
          category: Database["public"]["Enums"]["discipline_category"]
          created_at?: string
          description: string
          id?: string
          parent_notified?: boolean
          recorded_by: string
          school_id: string
          severity: Database["public"]["Enums"]["discipline_severity"]
          student_id: string
        }
        Update: {
          academic_year_id?: string | null
          category?: Database["public"]["Enums"]["discipline_category"]
          created_at?: string
          description?: string
          id?: string
          parent_notified?: boolean
          recorded_by?: string
          school_id?: string
          severity?: Database["public"]["Enums"]["discipline_severity"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discipline_records_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_kyc_completeness"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "discipline_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          created_at: string
          default_validity_months: number | null
          description: string | null
          expires: boolean
          id: string
          is_active: boolean
          is_custom: boolean
          is_required: boolean
          name: string
          school_id: string
          sort_order: number
          subject_type: Database["public"]["Enums"]["kyc_subject_type"]
        }
        Insert: {
          created_at?: string
          default_validity_months?: number | null
          description?: string | null
          expires?: boolean
          id?: string
          is_active?: boolean
          is_custom?: boolean
          is_required?: boolean
          name: string
          school_id: string
          sort_order?: number
          subject_type?: Database["public"]["Enums"]["kyc_subject_type"]
        }
        Update: {
          created_at?: string
          default_validity_months?: number | null
          description?: string | null
          expires?: boolean
          id?: string
          is_active?: boolean
          is_custom?: boolean
          is_required?: boolean
          name?: string
          school_id?: string
          sort_order?: number
          subject_type?: Database["public"]["Enums"]["kyc_subject_type"]
        }
        Relationships: [
          {
            foreignKeyName: "document_types_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_results: {
        Row: {
          created_at: string
          exam_id: string
          grade: string | null
          id: string
          marks_obtained: number | null
          max_marks: number
          school_id: string
          student_id: string
          subject_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          grade?: string | null
          id?: string
          marks_obtained?: number | null
          max_marks?: number
          school_id: string
          student_id: string
          subject_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          grade?: string | null
          id?: string
          marks_obtained?: number | null
          max_marks?: number
          school_id?: string
          student_id?: string
          subject_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_results_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_kyc_completeness"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "exam_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_results_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_schedule_slots: {
        Row: {
          class_id: string
          created_at: string
          created_by: string | null
          end_time: string
          exam_date: string
          exam_id: string
          id: string
          invigilator_id: string | null
          is_dirty: boolean
          room_id: string | null
          school_id: string
          start_time: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by?: string | null
          end_time: string
          exam_date: string
          exam_id: string
          id?: string
          invigilator_id?: string | null
          is_dirty?: boolean
          room_id?: string | null
          school_id: string
          start_time: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string | null
          end_time?: string
          exam_date?: string
          exam_id?: string
          id?: string
          invigilator_id?: string | null
          is_dirty?: boolean
          room_id?: string | null
          school_id?: string
          start_time?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_schedule_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_schedule_slots_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_schedule_slots_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_schedule_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_schedule_slots_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          academic_year_id: string
          created_at: string
          datesheet_last_notified_at: string | null
          datesheet_published_at: string | null
          end_date: string | null
          id: string
          name: string
          school_id: string
          start_date: string | null
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          datesheet_last_notified_at?: string | null
          datesheet_published_at?: string | null
          end_date?: string | null
          id?: string
          name: string
          school_id: string
          start_date?: string | null
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          datesheet_last_notified_at?: string | null
          datesheet_published_at?: string | null
          end_date?: string | null
          id?: string
          name?: string
          school_id?: string
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exams_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_line_items: {
        Row: {
          academic_year_id: string | null
          added_by: string | null
          class_id: string | null
          created_at: string
          due_date: string | null
          fee_type_id: string
          id: string
          school_id: string
          status: string
          student_id: string
          total_amount: number
        }
        Insert: {
          academic_year_id?: string | null
          added_by?: string | null
          class_id?: string | null
          created_at?: string
          due_date?: string | null
          fee_type_id: string
          id?: string
          school_id: string
          status?: string
          student_id: string
          total_amount: number
        }
        Update: {
          academic_year_id?: string | null
          added_by?: string | null
          class_id?: string | null
          created_at?: string
          due_date?: string | null
          fee_type_id?: string
          id?: string
          school_id?: string
          status?: string
          student_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_line_items_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_line_items_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_line_items_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_line_items_fee_type_id_fkey"
            columns: ["fee_type_id"]
            isOneToOne: false
            referencedRelation: "fee_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_line_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_line_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_kyc_completeness"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "fee_line_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_types: {
        Row: {
          category: string
          created_at: string
          id: string
          is_one_time: boolean
          is_optional: boolean
          is_predefined: boolean
          is_refundable: boolean
          name: string
          school_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_one_time?: boolean
          is_optional?: boolean
          is_predefined?: boolean
          is_refundable?: boolean
          name: string
          school_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_one_time?: boolean
          is_optional?: boolean
          is_predefined?: boolean
          is_refundable?: boolean
          name?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_types_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          academic_year_id: string | null
          created_at: string
          from_user_id: string
          id: string
          message: string
          response: string | null
          school_id: string
          status: Database["public"]["Enums"]["feedback_status"]
          subject: string
          to_role: Database["public"]["Enums"]["app_role"]
          to_user_id: string | null
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string
          from_user_id: string
          id?: string
          message: string
          response?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["feedback_status"]
          subject: string
          to_role: Database["public"]["Enums"]["app_role"]
          to_user_id?: string | null
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string
          from_user_id?: string
          id?: string
          message?: string
          response?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["feedback_status"]
          subject?: string
          to_role?: Database["public"]["Enums"]["app_role"]
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      homework: {
        Row: {
          academic_year_id: string | null
          class_id: string
          created_at: string
          description: string | null
          due_date: string
          id: string
          school_id: string
          section_id: string
          subject_id: string
          teacher_id: string
          title: string
        }
        Insert: {
          academic_year_id?: string | null
          class_id: string
          created_at?: string
          description?: string | null
          due_date: string
          id?: string
          school_id: string
          section_id: string
          subject_id: string
          teacher_id: string
          title: string
        }
        Update: {
          academic_year_id?: string | null
          class_id?: string
          created_at?: string
          description?: string | null
          due_date?: string
          id?: string
          school_id?: string
          section_id?: string
          subject_id?: string
          teacher_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          homework_id: string
          id: string
          school_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          homework_id: string
          id?: string
          school_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          homework_id?: string
          id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_attachments_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homework"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_attachments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_status: {
        Row: {
          created_at: string
          done_at: string | null
          homework_id: string
          id: string
          rating: Database["public"]["Enums"]["homework_rating"] | null
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string
          state: Database["public"]["Enums"]["homework_state"]
          student_id: string
          teacher_comment: string | null
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          done_at?: string | null
          homework_id: string
          id?: string
          rating?: Database["public"]["Enums"]["homework_rating"] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: string
          state: Database["public"]["Enums"]["homework_state"]
          student_id: string
          teacher_comment?: string | null
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          done_at?: string | null
          homework_id?: string
          id?: string
          rating?: Database["public"]["Enums"]["homework_rating"] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string
          state?: Database["public"]["Enums"]["homework_state"]
          student_id?: string
          teacher_comment?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "homework_status_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homework"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_status_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_status_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_kyc_completeness"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "homework_status_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_documents: {
        Row: {
          created_at: string
          document_type_id: string
          expires_on: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          rejection_reason: string | null
          school_id: string
          status: Database["public"]["Enums"]["kyc_doc_status"]
          subject_id: string
          subject_type: Database["public"]["Enums"]["kyc_subject_type"]
          uploaded_by: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          document_type_id: string
          expires_on?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          rejection_reason?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["kyc_doc_status"]
          subject_id: string
          subject_type?: Database["public"]["Enums"]["kyc_subject_type"]
          uploaded_by: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          document_type_id?: string
          expires_on?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          rejection_reason?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["kyc_doc_status"]
          subject_id?: string
          subject_type?: Database["public"]["Enums"]["kyc_subject_type"]
          uploaded_by?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kyc_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_documents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          academic_year_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          from_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          note: string | null
          requested_by: string
          school_id: string
          session_scope: Database["public"]["Enums"]["leave_session_scope"]
          status: Database["public"]["Enums"]["leave_status"]
          student_id: string
          to_date: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_date: string
          id?: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          note?: string | null
          requested_by: string
          school_id: string
          session_scope?: Database["public"]["Enums"]["leave_session_scope"]
          status?: Database["public"]["Enums"]["leave_status"]
          student_id: string
          to_date: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_date?: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          note?: string | null
          requested_by?: string
          school_id?: string
          session_scope?: Database["public"]["Enums"]["leave_session_scope"]
          status?: Database["public"]["Enums"]["leave_status"]
          student_id?: string
          to_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_kyc_completeness"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "leave_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      line_item_payments: {
        Row: {
          amount_applied: number
          created_at: string
          id: string
          line_item_id: string
          payment_id: string
        }
        Insert: {
          amount_applied: number
          created_at?: string
          id?: string
          line_item_id: string
          payment_id: string
        }
        Update: {
          amount_applied?: number
          created_at?: string
          id?: string
          line_item_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_item_payments_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "fee_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_item_payments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          school_id: string
          student_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_read?: boolean
          school_id: string
          student_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          school_id?: string
          student_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_kyc_completeness"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "notifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          created_at: string
          id: string
          mode: string
          notes: string | null
          paid_by_profile_id: string | null
          payment_date: string
          payment_method: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          school_id: string
          student_id: string
          total_amount: number
          transaction_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: string
          notes?: string | null
          paid_by_profile_id?: string | null
          payment_date?: string
          payment_method?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          school_id: string
          student_id: string
          total_amount: number
          transaction_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string
          notes?: string | null
          paid_by_profile_id?: string | null
          payment_date?: string
          payment_method?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          school_id?: string
          student_id?: string
          total_amount?: number
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_paid_by_profile_id_fkey"
            columns: ["paid_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_kyc_completeness"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          announcements_seen_at: string | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string
          push_token: string | null
        }
        Insert: {
          announcements_seen_at?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id: string
          phone: string
          push_token?: string | null
        }
        Update: {
          announcements_seen_at?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string
          push_token?: string | null
        }
        Relationships: []
      }
      quiz_answers: {
        Row: {
          answered_at: string
          attempt_id: string
          graded_at: string | null
          graded_by: string | null
          grading_status: Database["public"]["Enums"]["quiz_grading_status"]
          id: string
          is_correct: boolean | null
          points_awarded: number | null
          question_id: string
          school_id: string
          selected_option_id: string | null
          short_answer_text: string | null
        }
        Insert: {
          answered_at?: string
          attempt_id: string
          graded_at?: string | null
          graded_by?: string | null
          grading_status?: Database["public"]["Enums"]["quiz_grading_status"]
          id?: string
          is_correct?: boolean | null
          points_awarded?: number | null
          question_id: string
          school_id: string
          selected_option_id?: string | null
          short_answer_text?: string | null
        }
        Update: {
          answered_at?: string
          attempt_id?: string
          graded_at?: string | null
          graded_by?: string | null
          grading_status?: Database["public"]["Enums"]["quiz_grading_status"]
          id?: string
          is_correct?: boolean | null
          points_awarded?: number | null
          question_id?: string
          school_id?: string
          selected_option_id?: string | null
          short_answer_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "quiz_options"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_assignments: {
        Row: {
          class_id: string
          created_at: string
          id: string
          quiz_id: string
          school_id: string
          section_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          quiz_id: string
          school_id: string
          section_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          quiz_id?: string
          school_id?: string
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_assignments_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_assignments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          attempt_number: number
          auto_submitted: boolean
          created_by: string
          excluded: boolean
          id: string
          joined_at_question_index: number | null
          quiz_id: string
          school_id: string
          started_at: string
          status: Database["public"]["Enums"]["quiz_attempt_status"]
          student_id: string
          submitted_at: string | null
        }
        Insert: {
          attempt_number?: number
          auto_submitted?: boolean
          created_by: string
          excluded?: boolean
          id?: string
          joined_at_question_index?: number | null
          quiz_id: string
          school_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["quiz_attempt_status"]
          student_id: string
          submitted_at?: string | null
        }
        Update: {
          attempt_number?: number
          auto_submitted?: boolean
          created_by?: string
          excluded?: boolean
          id?: string
          joined_at_question_index?: number | null
          quiz_id?: string
          school_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["quiz_attempt_status"]
          student_id?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_kyc_completeness"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "quiz_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_blocker_reports: {
        Row: {
          id: string
          message: string | null
          quiz_id: string
          reason: Database["public"]["Enums"]["quiz_blocker_reason"]
          reported_at: string
          resolved_at: string | null
          resolved_by: string | null
          school_id: string
          status: Database["public"]["Enums"]["quiz_blocker_status"]
          student_id: string
        }
        Insert: {
          id?: string
          message?: string | null
          quiz_id: string
          reason: Database["public"]["Enums"]["quiz_blocker_reason"]
          reported_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["quiz_blocker_status"]
          student_id: string
        }
        Update: {
          id?: string
          message?: string | null
          quiz_id?: string
          reason?: Database["public"]["Enums"]["quiz_blocker_reason"]
          reported_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["quiz_blocker_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_blocker_reports_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_blocker_reports_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_blocker_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_kyc_completeness"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "quiz_blocker_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_live_participants: {
        Row: {
          id: string
          joined_at: string
          quiz_id: string
          school_id: string
          status: Database["public"]["Enums"]["quiz_participant_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          joined_at?: string
          quiz_id: string
          school_id: string
          status?: Database["public"]["Enums"]["quiz_participant_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          joined_at?: string
          quiz_id?: string
          school_id?: string
          status?: Database["public"]["Enums"]["quiz_participant_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_live_participants_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_live_participants_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_live_participants_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_kyc_completeness"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "quiz_live_participants_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_options: {
        Row: {
          id: string
          is_correct: boolean
          option_text: string
          order_index: number
          question_id: string
          school_id: string
        }
        Insert: {
          id?: string
          is_correct?: boolean
          option_text: string
          order_index: number
          question_id: string
          school_id: string
        }
        Update: {
          id?: string
          is_correct?: boolean
          option_text?: string
          order_index?: number
          question_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_options_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          created_at: string
          id: string
          order_index: number
          points: number
          prompt: string
          quiz_id: string
          school_id: string
          short_answer_rubric: string | null
          time_limit_seconds: number | null
          type: Database["public"]["Enums"]["quiz_question_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          order_index: number
          points?: number
          prompt: string
          quiz_id: string
          school_id: string
          short_answer_rubric?: string | null
          time_limit_seconds?: number | null
          type: Database["public"]["Enums"]["quiz_question_type"]
        }
        Update: {
          created_at?: string
          id?: string
          order_index?: number
          points?: number
          prompt?: string
          quiz_id?: string
          school_id?: string
          short_answer_rubric?: string | null
          time_limit_seconds?: number | null
          type?: Database["public"]["Enums"]["quiz_question_type"]
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_results: {
        Row: {
          attempt_id: string
          computed_at: string
          fully_graded: boolean
          id: string
          max_points: number
          passed: boolean | null
          percentage: number
          quiz_id: string
          school_id: string
          student_id: string
          total_points: number
        }
        Insert: {
          attempt_id: string
          computed_at?: string
          fully_graded?: boolean
          id?: string
          max_points?: number
          passed?: boolean | null
          percentage?: number
          quiz_id: string
          school_id: string
          student_id: string
          total_points?: number
        }
        Update: {
          attempt_id?: string
          computed_at?: string
          fully_graded?: boolean
          id?: string
          max_points?: number
          passed?: boolean | null
          percentage?: number
          quiz_id?: string
          school_id?: string
          student_id?: string
          total_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_results_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: true
            referencedRelation: "quiz_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_results_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_results_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_kyc_completeness"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "quiz_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          academic_year_id: string
          attempts_allowed: number
          class_id: string
          closes_at: string | null
          created_at: string
          created_by: string
          duration_seconds: number
          exam_id: string | null
          id: string
          instructions: string | null
          live_current_question_index: number | null
          live_late_join_allowed: boolean
          live_question_started_at: string | null
          live_status: Database["public"]["Enums"]["quiz_live_status"] | null
          mode: Database["public"]["Enums"]["quiz_mode"]
          opens_at: string | null
          pass_mark_pct: number | null
          pushed_to_gradebook_at: string | null
          question_count: number
          school_id: string
          section_id: string
          show_answers_after_close: boolean
          shuffle_questions: boolean
          status: Database["public"]["Enums"]["quiz_status"]
          subject_id: string
          title: string
          total_points: number
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          attempts_allowed?: number
          class_id: string
          closes_at?: string | null
          created_at?: string
          created_by: string
          duration_seconds: number
          exam_id?: string | null
          id?: string
          instructions?: string | null
          live_current_question_index?: number | null
          live_late_join_allowed?: boolean
          live_question_started_at?: string | null
          live_status?: Database["public"]["Enums"]["quiz_live_status"] | null
          mode?: Database["public"]["Enums"]["quiz_mode"]
          opens_at?: string | null
          pass_mark_pct?: number | null
          pushed_to_gradebook_at?: string | null
          question_count?: number
          school_id: string
          section_id: string
          show_answers_after_close?: boolean
          shuffle_questions?: boolean
          status?: Database["public"]["Enums"]["quiz_status"]
          subject_id: string
          title: string
          total_points?: number
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          attempts_allowed?: number
          class_id?: string
          closes_at?: string | null
          created_at?: string
          created_by?: string
          duration_seconds?: number
          exam_id?: string | null
          id?: string
          instructions?: string | null
          live_current_question_index?: number | null
          live_late_join_allowed?: boolean
          live_question_started_at?: string | null
          live_status?: Database["public"]["Enums"]["quiz_live_status"] | null
          mode?: Database["public"]["Enums"]["quiz_mode"]
          opens_at?: string | null
          pass_mark_pct?: number | null
          pushed_to_gradebook_at?: string | null
          question_count?: number
          school_id?: string
          section_id?: string
          show_answers_after_close?: boolean
          shuffle_questions?: boolean
          status?: Database["public"]["Enums"]["quiz_status"]
          subject_id?: string
          title?: string
          total_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      report_card_templates: {
        Row: {
          created_at: string
          html_template: string
          id: string
          is_default: boolean
          name: string
          school_id: string
        }
        Insert: {
          created_at?: string
          html_template?: string
          id?: string
          is_default?: boolean
          name: string
          school_id: string
        }
        Update: {
          created_at?: string
          html_template?: string
          id?: string
          is_default?: boolean
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_card_templates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          capacity: number | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          school_id: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          school_id: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          label: string | null
          school_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          label?: string | null
          school_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          label?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_domains_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_gallery: {
        Row: {
          academic_year_id: string | null
          caption: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string
          school_id: string
          uploaded_by: string | null
        }
        Insert: {
          academic_year_id?: string | null
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          school_id: string
          uploaded_by?: string | null
        }
        Update: {
          academic_year_id?: string | null
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          school_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_gallery_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_gallery_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_geofences: {
        Row: {
          center_lat: number
          center_lng: number
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          radius_m: number
          school_id: string
        }
        Insert: {
          center_lat: number
          center_lng: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          radius_m: number
          school_id: string
        }
        Update: {
          center_lat?: number
          center_lng?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          radius_m?: number
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_geofences_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_payment_gateways: {
        Row: {
          account_name: string | null
          key_id: string | null
          mode: string | null
          provider: string
          school_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_name?: string | null
          key_id?: string | null
          mode?: string | null
          provider?: string
          school_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_name?: string | null
          key_id?: string | null
          mode?: string | null
          provider?: string
          school_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_payment_gateways_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_payment_gateways_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          app_store_url: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          domain: string | null
          features_enabled: Json
          id: string
          is_active: boolean
          logo_url: string | null
          max_students: number
          name: string
          play_store_url: string | null
          primary_color: string
        }
        Insert: {
          address?: string | null
          app_store_url?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          domain?: string | null
          features_enabled?: Json
          id?: string
          is_active?: boolean
          logo_url?: string | null
          max_students?: number
          name: string
          play_store_url?: string | null
          primary_color?: string
        }
        Update: {
          address?: string | null
          app_store_url?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          domain?: string | null
          features_enabled?: Json
          id?: string
          is_active?: boolean
          logo_url?: string | null
          max_students?: number
          name?: string
          play_store_url?: string | null
          primary_color?: string
        }
        Relationships: []
      }
      section_assignments: {
        Row: {
          academic_year_id: string
          class_teacher_id: string
          created_at: string
          id: string
          school_id: string
          section_id: string
        }
        Insert: {
          academic_year_id: string
          class_teacher_id: string
          created_at?: string
          id?: string
          school_id: string
          section_id: string
        }
        Update: {
          academic_year_id?: string
          class_teacher_id?: string
          created_at?: string
          id?: string
          school_id?: string
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_assignments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_assignments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          academic_year_id: string | null
          class_id: string
          created_at: string
          id: string
          name: string
          school_id: string
        }
        Insert: {
          academic_year_id?: string | null
          class_id: string
          created_at?: string
          id?: string
          name: string
          school_id: string
        }
        Update: {
          academic_year_id?: string | null
          class_id?: string
          created_at?: string
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      student_enrollments: {
        Row: {
          academic_year_id: string
          class_id: string
          created_at: string
          id: string
          is_active: boolean
          roll_number: string | null
          school_id: string
          section_id: string
          student_profile_id: string
        }
        Insert: {
          academic_year_id: string
          class_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          roll_number?: string | null
          school_id: string
          section_id: string
          student_profile_id: string
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          roll_number?: string | null
          school_id?: string
          section_id?: string
          student_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_enrollments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollments_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_kyc_completeness"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "student_enrollments_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_profiles: {
        Row: {
          admission_number: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          full_name: string | null
          gender: string | null
          id: string
          parent_profile_id: string | null
          photo_url: string | null
          profile_id: string | null
          school_id: string
        }
        Insert: {
          admission_number?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          parent_profile_id?: string | null
          photo_url?: string | null
          profile_id?: string | null
          school_id: string
        }
        Update: {
          admission_number?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          parent_profile_id?: string | null
          photo_url?: string | null
          profile_id?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_parent_profile_id_fkey"
            columns: ["parent_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          class_id: string
          code: string | null
          created_at: string
          id: string
          name: string
          school_id: string
        }
        Insert: {
          class_id: string
          code?: string | null
          created_at?: string
          id?: string
          name: string
          school_id: string
        }
        Update: {
          class_id?: string
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      syllabus: {
        Row: {
          academic_year_id: string
          class_id: string
          created_at: string
          file_url: string
          id: string
          school_id: string
          subject_id: string
        }
        Insert: {
          academic_year_id: string
          class_id: string
          created_at?: string
          file_url: string
          id?: string
          school_id: string
          subject_id: string
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          created_at?: string
          file_url?: string
          id?: string
          school_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "syllabus_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "syllabus_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "syllabus_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "syllabus_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_profiles: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          school_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          school_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable: {
        Row: {
          academic_year_id: string | null
          created_at: string
          day_of_week: number
          id: string
          period: number
          school_id: string
          section_id: string
          subject_id: string
          teacher_id: string
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          period: number
          school_id: string
          section_id: string
          subject_id: string
          teacher_id: string
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          period?: number
          school_id?: string
          section_id?: string
          subject_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          school_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      student_fee_status: {
        Row: {
          academic_year_id: string | null
          class_id: string | null
          class_name: string | null
          days_overdue: number | null
          earliest_unpaid_due: string | null
          is_overdue: boolean | null
          outstanding: number | null
          school_id: string | null
          student_id: string | null
          student_name: string | null
          total_billed: number | null
          total_paid: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_line_items_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_line_items_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_line_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_line_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_kyc_completeness"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "fee_line_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_kyc_completeness: {
        Row: {
          pending_count: number | null
          required_total: number | null
          school_id: string | null
          student_id: string | null
          student_name: string | null
          verified_count: number | null
        }
        Insert: {
          pending_count?: never
          required_total?: never
          school_id?: string | null
          student_id?: string | null
          student_name?: string | null
          verified_count?: never
        }
        Update: {
          pending_count?: never
          required_total?: never
          school_id?: string | null
          student_id?: string | null
          student_name?: string | null
          verified_count?: never
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _end_live_quiz_core: { Args: { p_quiz_id: string }; Returns: undefined }
      _grade_and_finalize_attempt: {
        Args: { p_attempt_id: string; p_auto: boolean }
        Returns: undefined
      }
      _has_storage_admin_role: { Args: never; Returns: boolean }
      _haversine_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      _homework_school: { Args: { p_homework_id: string }; Returns: string }
      _payment_secret_name: {
        Args: { p_kind: string; p_school_id: string }
        Returns: string
      }
      _vault_get: { Args: { p_name: string }; Returns: string }
      acknowledge_blocker: { Args: { p_report_id: string }; Returns: undefined }
      advance_application: {
        Args: {
          p_id: string
          p_note: string
          p_to_stage: Database["public"]["Enums"]["admission_stage"]
        }
        Returns: undefined
      }
      advance_live_question: { Args: { p_quiz_id: string }; Returns: undefined }
      allow_late_join: {
        Args: { p_enabled: boolean; p_quiz_id: string }
        Returns: undefined
      }
      approve_leave: { Args: { p_request_id: string }; Returns: undefined }
      can_write_section_attendance: {
        Args: { p_section_id: string }
        Returns: boolean
      }
      cancel_leave: { Args: { p_request_id: string }; Returns: undefined }
      check_phone_has_access: {
        Args: { p_phone: string; p_school_id: string }
        Returns: boolean
      }
      close_quiz: { Args: { p_quiz_id: string }; Returns: undefined }
      create_walkin_application: {
        Args: {
          p_applicant_name: string
          p_applicant_note: string
          p_area: string
          p_class_applied_id: string
          p_date_of_birth: string
          p_gender: string
          p_parent_email: string
          p_parent_name: string
          p_parent_phone: string
          p_previous_school: string
          p_school_id: string
        }
        Returns: string
      }
      end_live_quiz: { Args: { p_quiz_id: string }; Returns: undefined }
      exclude_participant: {
        Args: { p_quiz_id: string; p_student_id: string }
        Returns: undefined
      }
      feature_enabled: {
        Args: { p_key: string; p_school_id: string }
        Returns: boolean
      }
      finalize_conversion: {
        Args: {
          p_admission_number: string
          p_app_id: string
          p_parent_profile_id: string
          p_roll_number: string
          p_section_id: string
        }
        Returns: string
      }
      force_submit_expired_attempts: { Args: never; Returns: undefined }
      get_active_academic_year: {
        Args: { p_school_id: string }
        Returns: string
      }
      get_live_current_question: {
        Args: { p_quiz_id: string; p_student_id: string }
        Returns: {
          option_id: string
          option_order: number
          option_text: string
          order_index: number
          points: number
          prompt: string
          question_id: string
          question_started_at: string
          time_limit_seconds: number
          type: Database["public"]["Enums"]["quiz_question_type"]
        }[]
      }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_my_school_id: { Args: never; Returns: string }
      get_payment_secret: {
        Args: { p_kind: string; p_school_id: string }
        Returns: string
      }
      get_public_admission_config: {
        Args: { p_school_domain: string }
        Returns: Json
      }
      get_quiz_for_attempt: {
        Args: { p_attempt_id: string }
        Returns: {
          option_id: string
          option_order: number
          option_text: string
          order_index: number
          points: number
          prompt: string
          question_id: string
          type: Database["public"]["Enums"]["quiz_question_type"]
        }[]
      }
      get_quiz_review: {
        Args: { p_attempt_id: string }
        Returns: {
          correct_option_id: string
          correct_text: string
          is_correct: boolean
          points: number
          points_awarded: number
          prompt: string
          question_id: string
          selected_option_id: string
          selected_text: string
        }[]
      }
      get_school_id_by_domain: { Args: { p_domain: string }; Returns: string }
      get_student_kyc_checklist: {
        Args: { p_student_id: string }
        Returns: {
          created_at: string
          document_id: string
          document_type_id: string
          document_type_name: string
          expires: boolean
          expires_on: string
          file_name: string
          file_size: number
          file_type: string
          is_required: boolean
          rejection_reason: string
          status: Database["public"]["Enums"]["kyc_doc_status"]
          uploaded_by_name: string
          verified_at: string
          verified_by_name: string
        }[]
      }
      grade_short_answer: {
        Args: { p_answer_id: string; p_note: string; p_points: number }
        Returns: undefined
      }
      is_parent_of_student: { Args: { p_student_id: string }; Returns: boolean }
      join_live_quiz: {
        Args: { p_quiz_id: string; p_student_id: string }
        Returns: undefined
      }
      mark_attendance: {
        Args: {
          p_accuracy?: number
          p_date: string
          p_geo_source?: string
          p_lat?: number
          p_lng?: number
          p_records: Json
          p_section_id: string
          p_session: Database["public"]["Enums"]["attendance_session"]
        }
        Returns: undefined
      }
      mark_homework_done: {
        Args: { p_homework_id: string; p_student_id: string }
        Returns: undefined
      }
      mark_homework_viewed: {
        Args: { p_homework_id: string; p_student_id: string }
        Returns: undefined
      }
      publish_quiz: { Args: { p_quiz_id: string }; Returns: undefined }
      push_quiz_to_gradebook: { Args: { p_quiz_id: string }; Returns: string }
      quiz_visible_to_parent: { Args: { p_quiz_id: string }; Returns: boolean }
      reject_document: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      reject_leave: {
        Args: { p_reason: string; p_request_id: string }
        Returns: undefined
      }
      report_quiz_blocker: {
        Args: {
          p_message: string
          p_quiz_id: string
          p_reason: Database["public"]["Enums"]["quiz_blocker_reason"]
          p_student_id: string
        }
        Returns: string
      }
      request_leave: {
        Args: {
          p_from: string
          p_note: string
          p_student_id: string
          p_to: string
          p_type: Database["public"]["Enums"]["leave_type"]
        }
        Returns: string
      }
      review_homework: {
        Args: {
          p_comment: string
          p_homework_id: string
          p_rating: Database["public"]["Enums"]["homework_rating"]
          p_student_id: string
        }
        Returns: undefined
      }
      save_admission_settings: {
        Args: {
          p_fee: number
          p_is_open: boolean
          p_school_id: string
          p_year_id: string
        }
        Returns: undefined
      }
      save_application_review: {
        Args: {
          p_assigned_to: string
          p_docs_note: string
          p_docs_reviewed: boolean
          p_id: string
          p_internal_notes: string
          p_score: number
        }
        Returns: undefined
      }
      save_document_type: {
        Args: {
          p_default_validity_months: number
          p_description: string
          p_expires: boolean
          p_id: string
          p_is_required: boolean
          p_name: string
          p_school_id: string
        }
        Returns: string
      }
      save_quiz_answer: {
        Args: {
          p_attempt_id: string
          p_question_id: string
          p_selected_option_id: string
          p_short_text: string
        }
        Returns: undefined
      }
      scope_pre_request: { Args: never; Returns: undefined }
      seed_document_types: { Args: { p_school_id: string }; Returns: undefined }
      send_sms: { Args: { event: Json }; Returns: Json }
      set_document_type_active: {
        Args: { p_active: boolean; p_id: string }
        Returns: undefined
      }
      set_payment_secret: {
        Args: { p_kind: string; p_school_id: string; p_value: string }
        Returns: undefined
      }
      start_live_quiz: { Args: { p_quiz_id: string }; Returns: undefined }
      start_quiz_attempt: {
        Args: { p_quiz_id: string; p_student_id: string }
        Returns: string
      }
      submit_quiz_attempt: {
        Args: { p_attempt_id: string }
        Returns: undefined
      }
      teaches_class: { Args: { p_class_id: string }; Returns: boolean }
      teaches_homework_section: {
        Args: { p_homework_id: string }
        Returns: boolean
      }
      teaches_section: { Args: { p_section_id: string }; Returns: boolean }
      teaches_student: {
        Args: { p_student_profile_id: string }
        Returns: boolean
      }
      unmark_homework_done: {
        Args: { p_homework_id: string; p_student_id: string }
        Returns: undefined
      }
      upsert_kyc_document: {
        Args: {
          p_document_type_id: string
          p_file_name: string
          p_file_path: string
          p_file_size: number
          p_file_type: string
          p_subject_id: string
        }
        Returns: string
      }
      verify_documents: { Args: { p_ids: string[] }; Returns: undefined }
    }
    Enums: {
      admission_payment_status: "not_required" | "pending" | "paid"
      admission_source: "online" | "walk_in"
      admission_stage:
        | "enquiry"
        | "under_review"
        | "offered"
        | "enrolled"
        | "rejected"
      announcement_target_type: "school" | "class" | "section"
      app_role:
        | "super_admin"
        | "school_admin"
        | "principal"
        | "teacher"
        | "student"
        | "parent"
      attendance_session: "FULL_DAY" | "FN" | "AN"
      attendance_status: "present" | "absent" | "late" | "half_day" | "excused"
      discipline_category: "behavioral" | "academic" | "attendance"
      discipline_severity: "verbal" | "written" | "suspension"
      fee_payment_status: "pending" | "paid" | "partial" | "overdue"
      feedback_status: "open" | "responded" | "closed"
      geo_status: "inside" | "outside" | "no_gps" | "not_captured"
      homework_rating: "good" | "satisfactory" | "needs_improvement"
      homework_state: "viewed" | "done"
      kyc_doc_status: "submitted" | "verified" | "rejected" | "expired"
      kyc_subject_type: "student" | "staff"
      leave_session_scope: "FULL_DAY"
      leave_status: "pending" | "approved" | "rejected" | "cancelled"
      leave_type: "sick" | "casual" | "other"
      quiz_attempt_status: "in_progress" | "submitted" | "graded"
      quiz_blocker_reason:
        | "technical"
        | "connectivity"
        | "device"
        | "not_available"
        | "other"
      quiz_blocker_status: "open" | "acknowledged" | "resolved"
      quiz_grading_status: "auto" | "pending_manual_grade" | "manually_graded"
      quiz_live_status: "not_started" | "in_progress" | "ended"
      quiz_mode: "async" | "live"
      quiz_participant_status: "joined" | "excluded"
      quiz_question_type: "mcq" | "true_false" | "short_answer"
      quiz_status: "draft" | "scheduled" | "open" | "closed"
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
      admission_payment_status: ["not_required", "pending", "paid"],
      admission_source: ["online", "walk_in"],
      admission_stage: [
        "enquiry",
        "under_review",
        "offered",
        "enrolled",
        "rejected",
      ],
      announcement_target_type: ["school", "class", "section"],
      app_role: [
        "super_admin",
        "school_admin",
        "principal",
        "teacher",
        "student",
        "parent",
      ],
      attendance_session: ["FULL_DAY", "FN", "AN"],
      attendance_status: ["present", "absent", "late", "half_day", "excused"],
      discipline_category: ["behavioral", "academic", "attendance"],
      discipline_severity: ["verbal", "written", "suspension"],
      fee_payment_status: ["pending", "paid", "partial", "overdue"],
      feedback_status: ["open", "responded", "closed"],
      geo_status: ["inside", "outside", "no_gps", "not_captured"],
      homework_rating: ["good", "satisfactory", "needs_improvement"],
      homework_state: ["viewed", "done"],
      kyc_doc_status: ["submitted", "verified", "rejected", "expired"],
      kyc_subject_type: ["student", "staff"],
      leave_session_scope: ["FULL_DAY"],
      leave_status: ["pending", "approved", "rejected", "cancelled"],
      leave_type: ["sick", "casual", "other"],
      quiz_attempt_status: ["in_progress", "submitted", "graded"],
      quiz_blocker_reason: [
        "technical",
        "connectivity",
        "device",
        "not_available",
        "other",
      ],
      quiz_blocker_status: ["open", "acknowledged", "resolved"],
      quiz_grading_status: ["auto", "pending_manual_grade", "manually_graded"],
      quiz_live_status: ["not_started", "in_progress", "ended"],
      quiz_mode: ["async", "live"],
      quiz_participant_status: ["joined", "excluded"],
      quiz_question_type: ["mcq", "true_false", "short_answer"],
      quiz_status: ["draft", "scheduled", "open", "closed"],
    },
  },
} as const

