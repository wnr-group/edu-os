import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const { studentId, examId } = await req.json() as { studentId: string; examId: string };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: student } = await supabase
      .from("student_profiles")
      .select("full_name")
      .eq("id", studentId)
      .single();

     const { data: exam } = await supabase
      .from("exams")
      .select("name, school_id, academic_year_id")
      .eq("id", examId)
      .single();

    if (exam?.school_id) {
      const { data: enabled } = await supabase.rpc("feature_enabled", {
        p_school_id: exam.school_id,
        p_key: "report_cards",
      });
      if (!enabled) {
        return new Response(
          JSON.stringify({ error: "Report cards are disabled for this school" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Match the enrollment to the exam's academic year so the report card shows
    // the class/section/roll the student held *that* year, not the current one.
    const { data: enrollment } = await supabase
      .from("student_enrollments")
      .select("roll_number, class:classes(name), section:sections(name)")
      .eq("student_profile_id", studentId)
      .eq("academic_year_id", exam?.academic_year_id ?? "")
      .maybeSingle();

    const { data: results } = await supabase
      .from("exam_results")
      .select("marks_obtained, max_marks, grade, subject:subjects(name)")
      .eq("student_id", studentId)
      .eq("exam_id", examId);

    // Check for school's custom template
    let htmlTemplate = DEFAULT_TEMPLATE;
    if (exam?.school_id) {
      const { data: template } = await supabase
        .from("report_card_templates")
        .select("html_template")
        .eq("school_id", exam.school_id)
        .eq("is_default", true)
        .single();
      if (template?.html_template) {
        htmlTemplate = template.html_template;
      }
    }

    // Calculate totals
    const totalMarks = (results ?? []).reduce((sum, r) => sum + (Number(r.marks_obtained) || 0), 0);
    const maxTotal = (results ?? []).reduce((sum, r) => sum + Number(r.max_marks), 0);
    const percentage = maxTotal > 0 ? ((totalMarks / maxTotal) * 100).toFixed(1) : "0.0";

    // Build results rows HTML
    const resultsRows = (results ?? [])
      .map((r) => {
        const subjectName = Array.isArray(r.subject)
          ? (r.subject[0] as { name: string })?.name ?? ""
          : (r.subject as { name: string } | null)?.name ?? "";
        return `<tr>
          <td>${subjectName}</td>
          <td>${r.marks_obtained ?? "—"}</td>
          <td>${r.max_marks}</td>
          <td>${r.grade ?? "—"}</td>
        </tr>`;
      })
      .join("");

    // Extract class/section names (handle Supabase join arrays)
    const className = Array.isArray(enrollment?.class)
      ? (enrollment.class[0] as { name: string })?.name ?? ""
      : (enrollment?.class as { name: string } | null)?.name ?? "";
    const sectionName = Array.isArray(enrollment?.section)
      ? (enrollment.section[0] as { name: string })?.name ?? ""
      : (enrollment?.section as { name: string } | null)?.name ?? "";

    // Inject data into template
    const html = htmlTemplate
      .replace(/\{\{student_name\}\}/g, student?.full_name ?? "")
      .replace(/\{\{roll_number\}\}/g, enrollment?.roll_number ?? "")
      .replace(/\{\{class\}\}/g, className)
      .replace(/\{\{section\}\}/g, sectionName)
      .replace(/\{\{exam_name\}\}/g, exam?.name ?? "")
      .replace(/\{\{results_rows\}\}/g, resultsRows)
      .replace(/\{\{total_marks\}\}/g, String(totalMarks))
      .replace(/\{\{max_marks\}\}/g, String(maxTotal))
      .replace(/\{\{percentage\}\}/g, `${percentage}%`);

    return new Response(html, {
      headers: {
        "Content-Type": "text/html",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; padding: 32px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 22px; margin-bottom: 4px; color: #111; }
    .meta { font-size: 14px; color: #555; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th, td { border: 1px solid #ddd; padding: 10px 14px; text-align: left; font-size: 14px; }
    th { background: #f5f5f5; font-weight: 600; }
    tr:nth-child(even) { background: #fafafa; }
    .footer { margin-top: 24px; font-size: 15px; font-weight: 600; }
    .percentage { color: #2563EB; }
  </style>
</head>
<body>
  <h1>Report Card — {{exam_name}}</h1>
  <div class="meta">
    <strong>{{student_name}}</strong> · Roll No: {{roll_number}} · Class {{class}} — Section {{section}}
  </div>
  <table>
    <thead>
      <tr><th>Subject</th><th>Marks Obtained</th><th>Max Marks</th><th>Grade</th></tr>
    </thead>
    <tbody>{{results_rows}}</tbody>
  </table>
  <div class="footer">
    Total: {{total_marks}} / {{max_marks}} · <span class="percentage">{{percentage}}</span>
  </div>
</body>
</html>`;
