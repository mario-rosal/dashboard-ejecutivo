update category_rules
set pattern = replace(pattern, E'\\\\', E'\\')
where match_type = 'regex'
  and user_id is null
  and pattern like '%\\\\%';
