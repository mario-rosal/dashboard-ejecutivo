delete from category_rules
where user_id is null
  and name in (
    'Restauracion/Ocio: Hosteleria',
    'Restauracion/Ocio: Restaurantes',
    'Restauracion/Ocio: Fast food',
    'Restauracion/Ocio: Dulces y helados',
    'Viajes: Movilidad urbana',
    'Viajes: Transporte publico',
    'Viajes: Alojamiento',
    'Alimentacion: Tiendas tradicionales'
  );

insert into category_rules (
  user_id,
  name,
  priority,
  is_active,
  match_field,
  match_type,
  pattern,
  txn_type_filter,
  category_id,
  confidence
)
select
  null,
  rule.name,
  rule.priority,
  true,
  rule.match_field,
  rule.match_type,
  rule.pattern,
  rule.txn_type_filter,
  categories.id,
  rule.confidence
from (
  values
    ('Restauracion/Ocio: Hosteleria', 78, 'description_clean'::category_match_field, 'regex'::category_match_type, '\\b(CAFE|COFFEE|CAFETERIA|BAR|PUB|CERVECERIA|TAPERIA)\\b', null::text[], 'restauracion-ocio', 0.82),
    ('Restauracion/Ocio: Restaurantes', 78, 'description_clean'::category_match_field, 'regex'::category_match_type, '\\b(RESTAURANTE|MESON|TABERNA|ASADOR|PARRILLA|BRASERIA|MARISQUERIA)\\b', null::text[], 'restauracion-ocio', 0.82),
    ('Restauracion/Ocio: Fast food', 78, 'description_clean'::category_match_field, 'regex'::category_match_type, '\\b(PIZZA|PIZZERIA|BURGER|HAMBURGUESERIA|KEBAB|TACO)\\b', null::text[], 'restauracion-ocio', 0.82),
    ('Restauracion/Ocio: Dulces y helados', 76, 'description_clean'::category_match_field, 'regex'::category_match_type, '\\b(GELATO|HELAD|HELADERIA|PASTELERIA|CHURRERIA|DULCE)\\b', null::text[], 'restauracion-ocio', 0.82),
    ('Viajes: Movilidad urbana', 82, 'description_clean'::category_match_field, 'regex'::category_match_type, '\\b(UBER|CABIFY|BOLT|FREE\\s*NOW|MYTAXI|TAXI|VTC)\\b', null::text[], 'viajes', 0.85),
    ('Viajes: Transporte publico', 82, 'description_clean'::category_match_field, 'regex'::category_match_type, '\\b(METRO|RENFE|ALSA|AVANZA|EMT|BUS|TREN|TRANVIA|IRYO|OUIGO)\\b', null::text[], 'viajes', 0.85),
    ('Viajes: Alojamiento', 82, 'description_clean'::category_match_field, 'regex'::category_match_type, '\\b(HOTEL|HOSTAL|HOSTEL|APARTAHOTEL|AIRBNB|BOOKING|EXPEDIA)\\b', null::text[], 'viajes', 0.85),
    ('Alimentacion: Tiendas tradicionales', 85, 'description_clean'::category_match_field, 'regex'::category_match_type, '\\b(FRUTERIA|CARNICERIA|PESCADERIA|CHARCUTERIA|PANADERIA)\\b', null::text[], 'alimentacion', 0.85)
) as rule(name, priority, match_field, match_type, pattern, txn_type_filter, category_slug, confidence)
join categories on categories.slug = rule.category_slug;
