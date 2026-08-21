export interface QuizOption {
  id: string;
  option_text: string;
  is_correct: boolean;
  order_index: number;
}

export interface QuizQuestion {
  id: string;
  type: "mcq" | "true_false" | "short_answer";
  prompt: string;
  points: number;
  order_index: number;
  short_answer_rubric: string | null;
  time_limit_seconds: number | null;
  options: QuizOption[];
}

export interface QuizDetail {
  id: string;
  title: string;
  instructions: string | null;
  mode: "async" | "live";
  status: "draft" | "scheduled" | "open" | "closed";
  subject_id: string;
  class_id: string;
  section_id: string;
  opens_at: string | null;
  closes_at: string | null;
  duration_seconds: number;
  attempts_allowed: number;
  shuffle_questions: boolean;
  pass_mark_pct: number | null;
  show_answers_after_close: boolean;
  question_count: number;
  total_points: number;
  pushed_to_gradebook_at: string | null;
}

export interface SubjectOption {
  id: string;
  name: string;
}
