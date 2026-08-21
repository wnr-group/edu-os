SELECT
    LOWER(email) AS email,
    COUNT(*) AS record_count
FROM public.profiles
WHERE LOWER(email) = LOWER('ravikumar@gmail.com')
GROUP BY LOWER(email);