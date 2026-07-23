type SectionIntroProps = {
  eyebrow: string
  title: string
  body?: string
  align?: 'left' | 'center'
}

export function SectionIntro({ eyebrow, title, body, align = 'left' }: SectionIntroProps) {
  return (
    <div className={`section-intro section-intro--${align}`} data-reveal>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {body && <p className="section-intro__body">{body}</p>}
    </div>
  )
}
