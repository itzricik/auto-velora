export {
  packages,
  serviceCards,
  services,
  vehicleTypes,
  type ServiceId,
  type VehicleId,
} from './pricing'

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

export const processSteps = ['assessment', 'preparation', 'detail', 'inspection'] as const

export const faqIds = ['duration', 'prepare', 'ceramic', 'scratches', 'finalPrice', 'location', 'cancel'] as const
