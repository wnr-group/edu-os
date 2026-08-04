select
  fli.id, fli.student_id, sp.full_name,
  fli.class_id, c.name as class_name,
  fli.fee_type_id, ft.name as fee_type_name,
  fli.total_amount, fli.status
from fee_line_items fli
join student_profiles sp on sp.id = fli.student_id
left join classes c on c.id = fli.class_id
left join fee_types ft on ft.id = fli.fee_type_id
where fli.school_id = 'aaaaaaaa-0000-0000-0000-000000000010'
order by sp.full_name;