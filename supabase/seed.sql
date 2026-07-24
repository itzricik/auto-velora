begin;

insert into public.vehicle_categories
  (id, code, name_en, name_lv, name_ru, price_multiplier, duration_multiplier, sort_order)
values
  ('10000000-0000-4000-8000-000000000001', 'compact', 'Compact', 'Kompakts', 'Компакт', 1.00, 1.00, 10),
  ('10000000-0000-4000-8000-000000000002', 'sedan', 'Sedan', 'Sedans', 'Седан', 1.10, 1.10, 20),
  ('10000000-0000-4000-8000-000000000003', 'suv', 'SUV', 'SUV', 'Кроссовер', 1.25, 1.25, 30),
  ('10000000-0000-4000-8000-000000000004', 'large', 'Large SUV / Van', 'Liels SUV / furgons', 'Большой SUV / фургон', 1.40, 1.40, 40)
on conflict (code) do update set
  name_en = excluded.name_en,
  name_lv = excluded.name_lv,
  name_ru = excluded.name_ru,
  price_multiplier = excluded.price_multiplier,
  duration_multiplier = excluded.duration_multiplier,
  sort_order = excluded.sort_order;

insert into public.services
  (id, code, name_en, name_lv, name_ru, description_en, description_lv, description_ru, base_price_cents, base_duration_minutes, sort_order)
values
  ('20000000-0000-4000-8000-000000000001', 'exterior', 'Signature Exterior', 'Signature Exterior', 'Signature Exterior', 'Exterior detailing and controlled finish care.', 'Virsbūves detailings un kontrolēta apdare.', 'Детейлинг кузова и контролируемая финишная обработка.', 4500, 120, 10),
  ('20000000-0000-4000-8000-000000000002', 'interior', 'Interior Reset', 'Interior Reset', 'Interior Reset', 'Deep interior cleaning with careful material treatment.', 'Padziļināta salona tīrīšana ar saudzīgu materiālu apstrādi.', 'Глубокая очистка салона с бережной обработкой материалов.', 12000, 300, 20),
  ('20000000-0000-4000-8000-000000000003', 'correction', 'Paint Correction', 'Paint Correction', 'Paint Correction', 'Measured paint correction for gloss and clarity.', 'Kontrolēta lakas korekcija spīdumam un dzidrumam.', 'Контролируемая коррекция лака для блеска и глубины.', 22000, 480, 30),
  ('20000000-0000-4000-8000-000000000004', 'ceramic', 'Ceramic Protection', 'Ceramic Protection', 'Ceramic Protection', 'Preparation and application of ceramic protection.', 'Sagatavošana un keramiskā pārklājuma uzklāšana.', 'Подготовка и нанесение керамической защиты.', 45000, 840, 40),
  ('20000000-0000-4000-8000-000000000005', 'ppfFront', 'Front Paint Protection Film', 'Priekšdaļas PPF', 'PPF передней части', 'Protection film for the high-impact front area.', 'Aizsargplēve noslogotākajām priekšdaļas zonām.', 'Защитная плёнка для наиболее уязвимой передней части.', 90000, 960, 50),
  ('20000000-0000-4000-8000-000000000006', 'ppfFull', 'Full Paint Protection Film', 'Pilns PPF', 'Полный PPF', 'Full-body paint protection film installation.', 'Pilna virsbūves aizsargplēves uzstādīšana.', 'Полная оклейка кузова защитной плёнкой.', 250000, 2400, 60),
  ('20000000-0000-4000-8000-000000000007', 'maintenance', 'Maintenance Care', 'Maintenance Care', 'Maintenance Care', 'Regular maintenance detailing after prior protection.', 'Regulāra kopšana pēc iepriekšējas aizsardzības.', 'Регулярный поддерживающий детейлинг после защиты.', 7500, 150, 70)
on conflict (code) do update set
  base_price_cents = excluded.base_price_cents,
  base_duration_minutes = excluded.base_duration_minutes,
  sort_order = excluded.sort_order;

insert into public.service_packages
  (id, code, name_en, name_lv, name_ru, description_en, description_lv, description_ru, package_price_cents, base_duration_minutes, sort_order)
values
  ('30000000-0000-4000-8000-000000000001', 'essential', 'Essential', 'Essential', 'Essential', 'Regular professional maintenance.', 'Regulāra profesionāla kopšana.', 'Регулярный профессиональный уход.', 8900, 270, 10),
  ('30000000-0000-4000-8000-000000000002', 'restore', 'Restore', 'Restore', 'Restore', 'Deeper cleaning and paint improvement.', 'Padziļināta tīrīšana un lakas uzlabošana.', 'Глубокая очистка и улучшение лакокрасочного покрытия.', 27900, 900, 20),
  ('30000000-0000-4000-8000-000000000003', 'protect', 'Protect', 'Protect', 'Protect', 'Correction and long-term surface protection.', 'Korekcija un ilgtermiņa virsmu aizsardzība.', 'Коррекция и долговременная защита поверхностей.', 54900, 1320, 30)
on conflict (code) do update set
  package_price_cents = excluded.package_price_cents,
  base_duration_minutes = excluded.base_duration_minutes,
  sort_order = excluded.sort_order;

insert into public.package_services (package_id, service_id, sort_order)
select package.id, service.id, mapping.sort_order
from (values
  ('essential', 'exterior', 10),
  ('essential', 'maintenance', 20),
  ('restore', 'exterior', 10),
  ('restore', 'interior', 20),
  ('restore', 'correction', 30),
  ('protect', 'correction', 10),
  ('protect', 'ceramic', 20)
) as mapping(package_code, service_code, sort_order)
join public.service_packages package on package.code = mapping.package_code
join public.services service on service.code = mapping.service_code
on conflict (package_id, service_id) do update set sort_order = excluded.sort_order;

insert into public.work_bays (id, code, name)
values ('40000000-0000-4000-8000-000000000001', 'bay_1', 'Detailing Bay 1')
on conflict (code) do update set name = excluded.name, is_active = true;

insert into public.business_hours (weekday, opens_at, closes_at, is_closed)
values
  (0, null, null, true),
  (1, '09:00', '19:00', false),
  (2, '09:00', '19:00', false),
  (3, '09:00', '19:00', false),
  (4, '09:00', '19:00', false),
  (5, '09:00', '19:00', false),
  (6, '10:00', '16:00', false);

commit;
