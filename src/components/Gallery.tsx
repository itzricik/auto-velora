import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { galleryItems, type GalleryCategory } from '../data'
import { translations, type Language } from '../i18n/translations'
import { SectionIntro } from './SectionIntro'

const categories: GalleryCategory[] = ['all', 'exterior', 'interior', 'protection']

export function Gallery({ language }: { language: Language }) {
  const copy = translations[language]
  const [filter, setFilter] = useState<GalleryCategory>('all')
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const visibleItems = galleryItems.filter((item) => filter === 'all' || item.category === filter)
  const activeItem = activeIndex === null ? null : visibleItems[activeIndex]

  const closeLightbox = () => {
    setActiveIndex(null)
    window.setTimeout(() => triggerRef.current?.focus(), 0)
  }

  const showPrevious = () => setActiveIndex((current) => current === null ? null : (current - 1 + visibleItems.length) % visibleItems.length)
  const showNext = () => setActiveIndex((current) => current === null ? null : (current + 1) % visibleItems.length)

  useEffect(() => {
    if (activeIndex === null) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLightbox()
      if (event.key === 'ArrowLeft') showPrevious()
      if (event.key === 'ArrowRight') showNext()
      if (event.key === 'Tab') {
        const controls = document.querySelectorAll<HTMLElement>('.lightbox button')
        if (!controls.length) return
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  })

  const selectFilter = (category: GalleryCategory) => {
    setFilter(category)
    setActiveIndex(null)
  }

  return (
    <section className="section gallery-section" id="work">
      <div className="container">
        <div className="gallery-heading">
          <SectionIntro eyebrow={copy.gallery.eyebrow} title={copy.gallery.title} body={copy.gallery.body} />
          <div className="gallery-filters" role="group" aria-label={copy.gallery.filterLabel} data-reveal>
            {categories.map((category) => (
              <button key={category} type="button" className={filter === category ? 'is-active' : ''} aria-pressed={filter === category} onClick={() => selectFilter(category)}>
                {copy.gallery.filters[category]}
              </button>
            ))}
          </div>
        </div>
        <div className="masonry-gallery" aria-live="polite">
          {visibleItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="gallery-item"
              onClick={(event) => {
                triggerRef.current = event.currentTarget
                setActiveIndex(index)
              }}
              aria-label={copy.gallery.open.replace('{title}', copy.gallery.titles[item.id])}
            >
              <img
                src={item.src}
                srcSet={`${item.src} 720w, ${item.srcLarge} 1200w`}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                width={item.width}
                height={item.height}
                loading="lazy"
                decoding="async"
                alt={copy.gallery.alts[item.id]}
              />
              <span className="gallery-item__veil" />
              <span className="gallery-item__caption"><small>{copy.gallery.filters[item.category]}</small>{copy.gallery.titles[item.id]}</span>
              <span className="gallery-item__expand"><Expand size={17} aria-hidden="true" /></span>
            </button>
          ))}
        </div>
      </div>

      {activeItem && activeIndex !== null && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={copy.gallery.titles[activeItem.id]} onMouseDown={(event) => event.target === event.currentTarget && closeLightbox()}>
          <button ref={closeButtonRef} className="lightbox__close" type="button" onClick={closeLightbox} aria-label={copy.gallery.close}><X aria-hidden="true" /></button>
          <button className="lightbox__nav lightbox__nav--prev" type="button" onClick={showPrevious} aria-label={copy.gallery.previous}><ChevronLeft aria-hidden="true" /></button>
          <figure>
            <img src={activeItem.srcLarge} width={activeItem.width} height={activeItem.height} alt={copy.gallery.alts[activeItem.id]} />
            <figcaption><span>{copy.gallery.titles[activeItem.id]}</span><small>{copy.gallery.counter.replace('{current}', String(activeIndex + 1)).replace('{total}', String(visibleItems.length))}</small></figcaption>
          </figure>
          <button className="lightbox__nav lightbox__nav--next" type="button" onClick={showNext} aria-label={copy.gallery.next}><ChevronRight aria-hidden="true" /></button>
        </div>
      )}
    </section>
  )
}
