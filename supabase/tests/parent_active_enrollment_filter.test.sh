#!/usr/bin/env bash
# Regression test for EDUOS-2026-08-18-05: parent-side screens resolving a
# student's current class/section via an embedded student_enrollments(...)
# select must filter to is_active=true. Without it, PostgREST returns EVERY
# enrollment row (including prior academic years) and code that blindly reads
# index [0] relies on unspecified row order — silently resolving the wrong
# class for any student with enrollment history across more than one year.
#
# This exercises the real PostgREST embedding layer (not just raw SQL, which
# doesn't reproduce PostgREST's array-embedding behavior) against the local
# Supabase instance.
#
# Run: bash supabase/tests/parent_active_enrollment_filter.test.sh
set -euo pipefail

API_URL="http://127.0.0.1:54321/rest/v1"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
DB="psql postgresql://postgres:postgres@127.0.0.1:54322/postgres"

STUDENT="dddddddd-0000-0000-0000-000000000001"
CURRENT_YEAR="aaaaaaaa-0000-0000-0000-000000000002"
PRIOR_YEAR="aaaaaaaa-0000-0000-0000-000000000003"
SCHOOL="aaaaaaaa-0000-0000-0000-000000000001"
OLD_CLASS="bbbbbbbb-0000-0000-0000-000000000005"
OLD_SECTION="cccccccc-0000-0000-0000-000000000501"

cleanup() {
  $DB -c "DELETE FROM public.student_enrollments WHERE student_profile_id='$STUDENT' AND academic_year_id='$PRIOR_YEAR';" >/dev/null
}
trap cleanup EXIT

# Fixture: a prior-year, inactive enrollment in a DIFFERENT class alongside
# the student's real current active enrollment.
$DB -c "INSERT INTO public.student_enrollments (student_profile_id, academic_year_id, school_id, class_id, section_id, is_active, roll_number)
        VALUES ('$STUDENT', '$PRIOR_YEAR', '$SCHOOL', '$OLD_CLASS', '$OLD_SECTION', false, '99');" >/dev/null

RESULT=$(curl -s "$API_URL/student_profiles?id=eq.$STUDENT&select=id,student_enrollments(class_id,is_active)&student_enrollments.is_active=eq.true" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY")

echo "Fixed query result: $RESULT"

COUNT=$(echo "$RESULT" | grep -o '"class_id"' | wc -l)
if [ "$COUNT" -ne 1 ]; then
  echo "FAIL: expected exactly 1 embedded enrollment row with the is_active filter, got $COUNT"
  exit 1
fi
if ! echo "$RESULT" | grep -q "bbbbbbbb-0000-0000-0000-000000000008"; then
  echo "FAIL: expected the student's real active class (bbbbbbbb-...008), got: $RESULT"
  exit 1
fi
if echo "$RESULT" | grep -q "$OLD_CLASS"; then
  echo "FAIL: stale inactive enrollment's class ($OLD_CLASS) leaked into the filtered result"
  exit 1
fi

echo "PASS: is_active filter returns exactly the current active enrollment, excluding prior-year rows"
