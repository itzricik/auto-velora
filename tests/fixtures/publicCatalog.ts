import type { PublicCatalog } from '../../src/shared/publicCatalog'

export const publicCatalogFixture: PublicCatalog = {
  vehicleCategories: [
    { id: '10000000-0000-4000-8000-000000000001', code: 'compact', name_en: 'Compact', name_lv: 'Kompakts', name_ru: 'Компакт', price_multiplier: 1, duration_multiplier: 1 },
    { id: '10000000-0000-4000-8000-000000000002', code: 'sedan', name_en: 'Sedan', name_lv: 'Sedans', name_ru: 'Седан', price_multiplier: 1.1, duration_multiplier: 1.1 },
    { id: '10000000-0000-4000-8000-000000000003', code: 'suv', name_en: 'SUV', name_lv: 'SUV', name_ru: 'SUV', price_multiplier: 1.25, duration_multiplier: 1.25 },
    { id: '10000000-0000-4000-8000-000000000004', code: 'large', name_en: 'Large', name_lv: 'Liels', name_ru: 'Большой', price_multiplier: 1.4, duration_multiplier: 1.4 },
  ],
  services: [
    ['20000000-0000-4000-8000-000000000001', 'exterior', 4500, 120],
    ['20000000-0000-4000-8000-000000000002', 'interior', 12000, 300],
    ['20000000-0000-4000-8000-000000000003', 'correction', 22000, 480],
    ['20000000-0000-4000-8000-000000000004', 'ceramic', 45000, 840],
    ['20000000-0000-4000-8000-000000000005', 'ppfFront', 90000, 960],
    ['20000000-0000-4000-8000-000000000006', 'ppfFull', 250000, 2400],
    ['20000000-0000-4000-8000-000000000007', 'maintenance', 7500, 150],
  ].map(([id, code, price, duration]) => ({
    id: String(id), code: String(code), name_en: String(code), name_lv: String(code), name_ru: String(code),
    description_en: '', description_lv: '', description_ru: '', best_for_en: null, best_for_lv: null, best_for_ru: null,
    included_work_en: [], included_work_lv: [], included_work_ru: [], protection_duration_en: null,
    protection_duration_lv: null, protection_duration_ru: null, recommended_condition_en: null,
    recommended_condition_lv: null, recommended_condition_ru: null, base_price_cents: Number(price),
    base_duration_minutes: Number(duration), buffer_minutes: 0,
  })),
  packages: [
    ['30000000-0000-4000-8000-000000000001', 'essential', 8900, 270, ['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000007']],
    ['30000000-0000-4000-8000-000000000002', 'restore', 27900, 900, ['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003']],
    ['30000000-0000-4000-8000-000000000003', 'protect', 54900, 1320, ['20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004']],
  ].map(([id, code, price, duration, serviceIds]) => ({
    id: String(id), code: String(code), name_en: String(code), name_lv: String(code), name_ru: String(code),
    description_en: '', description_lv: '', description_ru: '', package_price_cents: Number(price),
    base_duration_minutes: Number(duration), buffer_minutes: 0, service_ids: serviceIds as string[],
  })),
  conditionLevels: [], conditionIndicators: [], caseStudies: [], reviews: [], business: null,
  businessHours: [], requestId: 'fixture',
}
