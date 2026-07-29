-- fee_types: global predefined types (school_id IS NULL) are reference data,
-- not tenant data — left ungated. Only the school-scoped branch is gated.
DROP POLICY IF EXISTS "fee_types_read" ON public.fee_types;
CREATE POLICY "fee_types_read" ON public.fee_types FOR SELECT
  USING (
    school_id IS NULL
    OR public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'fees') AND school_id = public.get_my_school_id())
  );

DROP POLICY IF EXISTS "fee_types_insert" ON public.fee_types;
CREATE POLICY "fee_types_insert" ON public.fee_types FOR INSERT
  WITH CHECK (
    is_predefined = false
    AND (
      public.get_my_role() = 'super_admin'
      OR (public.feature_enabled(school_id,'fees') AND public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
    )
  );

DROP POLICY IF EXISTS "fee_types_update" ON public.fee_types;
CREATE POLICY "fee_types_update" ON public.fee_types FOR UPDATE
  USING (
    is_predefined = false
    AND (
      public.get_my_role() = 'super_admin'
      OR (public.feature_enabled(school_id,'fees') AND public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
    )
  )
  WITH CHECK (
    is_predefined = false
    AND (
      public.get_my_role() = 'super_admin'
      OR (public.feature_enabled(school_id,'fees') AND public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
    )
  );

DROP POLICY IF EXISTS "fee_types_delete" ON public.fee_types;
CREATE POLICY "fee_types_delete" ON public.fee_types FOR DELETE
  USING (
    is_predefined = false
    AND (
      public.get_my_role() = 'super_admin'
      OR (public.feature_enabled(school_id,'fees') AND public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
    )
  );

-- fee_line_items (parent read branch also gated — a disabled fees module hides balances from parents too)
DROP POLICY IF EXISTS "fli_read" ON public.fee_line_items;
CREATE POLICY "fli_read" ON public.fee_line_items FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR ( public.feature_enabled(school_id,'fees') AND (
      (public.get_my_role() IN ('school_admin', 'principal', 'teacher') AND school_id = public.get_my_school_id())
      OR EXISTS (
        SELECT 1 FROM public.student_profiles sp
        WHERE sp.id = fee_line_items.student_id AND sp.parent_profile_id = auth.uid()
      )
    ))
  );

DROP POLICY IF EXISTS "fli_write" ON public.fee_line_items;
CREATE POLICY "fli_write" ON public.fee_line_items FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'fees') AND public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
  );

DROP POLICY IF EXISTS "fli_update" ON public.fee_line_items;
CREATE POLICY "fli_update" ON public.fee_line_items FOR UPDATE
  USING (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'fees') AND public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'fees') AND public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
  );

-- payments (note: online_payments-specific writes are already gated separately
-- in create-razorpay-order per ERP-61 — this covers the 'fees' module broadly,
-- including manual/offline payment recording)
DROP POLICY IF EXISTS "payments_read" ON public.payments;
CREATE POLICY "payments_read" ON public.payments FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR ( public.feature_enabled(school_id,'fees') AND (
      (public.get_my_role() IN ('school_admin', 'principal', 'super_admin') AND school_id = public.get_my_school_id())
      OR EXISTS (
        SELECT 1 FROM public.student_profiles sp
        WHERE sp.id = payments.student_id AND sp.parent_profile_id = auth.uid()
      )
    ))
  );

DROP POLICY IF EXISTS "payments_write" ON public.payments;
CREATE POLICY "payments_write" ON public.payments FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (public.feature_enabled(school_id,'fees') AND public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
  );

-- line_item_payments (derives school via the joined payment/line item, no direct school_id column)
DROP POLICY IF EXISTS "lip_read" ON public.line_item_payments;
CREATE POLICY "lip_read" ON public.line_item_payments FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.id = line_item_payments.payment_id
        AND public.feature_enabled(p.school_id,'fees')
        AND (
          (public.get_my_role() IN ('school_admin', 'principal', 'super_admin') AND p.school_id = public.get_my_school_id())
          OR EXISTS (
            SELECT 1 FROM public.student_profiles sp
            WHERE sp.id = p.student_id AND sp.parent_profile_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "lip_write" ON public.line_item_payments;
CREATE POLICY "lip_write" ON public.line_item_payments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.payments p
      JOIN public.fee_line_items fli ON fli.id = line_item_payments.line_item_id
      WHERE p.id = line_item_payments.payment_id
        AND p.school_id = fli.school_id
        AND (
          public.get_my_role() = 'super_admin'
          OR (public.feature_enabled(p.school_id,'fees') AND public.get_my_role() = 'school_admin' AND p.school_id = public.get_my_school_id())
        )
    )
  );