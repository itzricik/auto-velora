import type { BookingLanguage } from './contracts'

export type ConditionRule = {
  id: string
  code: string
  label_en: string
  label_lv: string
  label_ru: string
  explanation_en: string
  explanation_lv: string
  explanation_ru: string
  min_surcharge_cents: number
  max_surcharge_cents: number
  min_duration_minutes: number
  max_duration_minutes: number
  is_active: boolean
  sort_order: number
  requires_business_confirmation: boolean
}

export type ConditionSnapshot = {
  level_id: string
  level_code: string
  level_label: string
  level_min_surcharge_cents: number
  level_max_surcharge_cents: number
  level_min_duration_minutes: number
  level_max_duration_minutes: number
  indicators: Array<{
    id: string
    code: string
    label: string
    min_surcharge_cents: number
    max_surcharge_cents: number
    min_duration_minutes: number
    max_duration_minutes: number
  }>
  total_min_surcharge_cents: number
  total_max_surcharge_cents: number
  total_min_duration_minutes: number
  total_max_duration_minutes: number
  customer_notes?: string
}

export function translatedRuleText(
  rule: ConditionRule,
  field: 'label' | 'explanation',
  language: BookingLanguage,
): string {
  const suffix = language === 'lv' ? 'lv' : language === 'ru' ? 'ru' : 'en'
  return rule[`${field}_${suffix}`]
}

export function calculateConditionSnapshot(input: {
  level: ConditionRule
  indicators: ConditionRule[]
  language: BookingLanguage
  notes?: string
}): ConditionSnapshot {
  const level = input.level
  const indicators = input.indicators.map((rule) => ({
    id: rule.id,
    code: rule.code,
    label: translatedRuleText(rule, 'label', input.language),
    min_surcharge_cents: rule.min_surcharge_cents,
    max_surcharge_cents: rule.max_surcharge_cents,
    min_duration_minutes: rule.min_duration_minutes,
    max_duration_minutes: rule.max_duration_minutes,
  }))
  return {
    level_id: level.id,
    level_code: level.code,
    level_label: translatedRuleText(level, 'label', input.language),
    level_min_surcharge_cents: level.min_surcharge_cents,
    level_max_surcharge_cents: level.max_surcharge_cents,
    level_min_duration_minutes: level.min_duration_minutes,
    level_max_duration_minutes: level.max_duration_minutes,
    indicators,
    total_min_surcharge_cents: level.min_surcharge_cents
      + indicators.reduce((total, rule) => total + rule.min_surcharge_cents, 0),
    total_max_surcharge_cents: level.max_surcharge_cents
      + indicators.reduce((total, rule) => total + rule.max_surcharge_cents, 0),
    total_min_duration_minutes: level.min_duration_minutes
      + indicators.reduce((total, rule) => total + rule.min_duration_minutes, 0),
    total_max_duration_minutes: level.max_duration_minutes
      + indicators.reduce((total, rule) => total + rule.max_duration_minutes, 0),
    customer_notes: input.notes?.trim() || undefined,
  }
}

export function conditionEstimate(
  basePriceCents: number,
  baseDurationMinutes: number,
  snapshot: ConditionSnapshot,
) {
  return {
    priceMinCents: basePriceCents + snapshot.total_min_surcharge_cents,
    priceMaxCents: basePriceCents + snapshot.total_max_surcharge_cents,
    durationMinMinutes: baseDurationMinutes + snapshot.total_min_duration_minutes,
    durationMaxMinutes: baseDurationMinutes + snapshot.total_max_duration_minutes,
  }
}
