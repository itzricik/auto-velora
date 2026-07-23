export const services = [
  { id: 'exterior', price: 45, hours: 2, cardDuration: '1.5–2 h', estimatorOnly: false },
  { id: 'interior', price: 120, hours: 5, cardDuration: '4–6 h', estimatorOnly: false },
  { id: 'correction', price: 220, hours: 8, cardDuration: '6–10 h', estimatorOnly: false },
  { id: 'ceramic', price: 450, hours: 14, cardDuration: '1–2 days', estimatorOnly: false },
  { id: 'ppfFront', price: 900, hours: 16, cardDuration: '1–2 days', estimatorOnly: false },
  { id: 'ppfFull', price: 2500, hours: 40, cardDuration: '3–5 days', estimatorOnly: true },
  { id: 'maintenance', price: 75, hours: 2.5, cardDuration: '2–3 h', estimatorOnly: false },
] as const

export type ServiceId = (typeof services)[number]['id']

export const vehicleTypes = [
  { id: 'compact', multiplier: 1 },
  { id: 'sedan', multiplier: 1.1 },
  { id: 'suv', multiplier: 1.25 },
  { id: 'large', multiplier: 1.4 },
] as const

export type VehicleId = (typeof vehicleTypes)[number]['id']

export const serviceCards = services.filter((service) => !service.estimatorOnly)

export const galleryItems = [
  {
    id: 'correction',
    category: 'exterior',
    src: '/images/paint-correction-720.webp',
    srcLarge: '/images/paint-correction-1200.webp',
    width: 1200,
    height: 800,
  },
  {
    id: 'interior',
    category: 'interior',
    src: '/images/interior-720.webp',
    srcLarge: '/images/interior-1200.webp',
    width: 1200,
    height: 800,
  },
  {
    id: 'ceramic',
    category: 'protection',
    src: '/images/ceramic-720.webp',
    srcLarge: '/images/ceramic-1200.webp',
    width: 1200,
    height: 800,
  },
  {
    id: 'ppf',
    category: 'protection',
    src: '/images/ppf-720.webp',
    srcLarge: '/images/ppf-1200.webp',
    width: 1200,
    height: 800,
  },
  {
    id: 'wheel',
    category: 'exterior',
    src: '/images/wheel-720.webp',
    srcLarge: '/images/wheel-1200.webp',
    width: 1200,
    height: 1200,
  },
  {
    id: 'finish',
    category: 'exterior',
    src: '/images/after-960.webp',
    srcLarge: '/images/after-1600.webp',
    width: 1600,
    height: 973,
  },
] as const

export type GalleryCategory = 'all' | (typeof galleryItems)[number]['category']

export const packages = [
  { id: 'essential', price: 89, featured: false },
  { id: 'restore', price: 279, featured: true },
  { id: 'protect', price: 549, featured: false },
] as const

export const processSteps = ['assessment', 'preparation', 'detail', 'inspection'] as const

export const faqIds = ['duration', 'prepare', 'ceramic', 'scratches', 'finalPrice', 'location', 'cancel'] as const
