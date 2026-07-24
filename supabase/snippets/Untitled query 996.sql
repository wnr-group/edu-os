select
    ur.user_id,
    ur.role,
    au.email
from user_roles ur
left join auth.users au
    on au.id = ur.user_id
where ur.role = 'principal';