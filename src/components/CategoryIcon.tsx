import {
  CircleQuestionMark,
  Clapperboard,
  FlaskConical,
  Globe,
  Landmark,
  Palette,
  Trophy,
} from 'lucide-react'

type Props = {
  id: string
  className?: string
  strokeWidth?: number
}

/** Icono de cada categoría; las categorías nuevas caen al comodín. */
export function CategoryIcon({ id, className, strokeWidth = 2.25 }: Props) {
  switch (id) {
    case 'arte':
      return <Palette className={className} strokeWidth={strokeWidth} aria-hidden="true" />
    case 'ciencia':
      return <FlaskConical className={className} strokeWidth={strokeWidth} aria-hidden="true" />
    case 'deportes':
      return <Trophy className={className} strokeWidth={strokeWidth} aria-hidden="true" />
    case 'entretenimiento':
      return <Clapperboard className={className} strokeWidth={strokeWidth} aria-hidden="true" />
    case 'geografia':
      return <Globe className={className} strokeWidth={strokeWidth} aria-hidden="true" />
    case 'historia':
      return <Landmark className={className} strokeWidth={strokeWidth} aria-hidden="true" />
    default:
      return <CircleQuestionMark className={className} strokeWidth={strokeWidth} aria-hidden="true" />
  }
}
