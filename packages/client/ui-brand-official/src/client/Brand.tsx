import { useState } from 'react'
import { BrandWordmark } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import datasecureLogo from './assets/dsh-datasecure-logo.png'
import datasecurePoster from './assets/dsh-waving-poster.png'
import datasecureWaving from './assets/dsh-waving.gif'

/**
 * Render the datasecure mark with the presentation requested by its host surface.
 * The artwork fills its square canvas, so the box is lifted by one eighth of the
 * requested size to align the whale with the adjacent wordmark baseline.
 * @param props - Host-supplied mark presentation.
 * @returns the Stefano's AI Lab whale mark.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return (
    <img
      src={datasecureLogo}
      width={size}
      height={size}
      alt=""
      draggable={false}
      style={{ transform: `translateY(${-size / 8}px)` }}
    />
  )
}

/**
 * Render the datasecure hero mark in place of the declaring package's
 * animated-fish fallback: static at rest, the waving whale gif only while the
 * pointer is over it -- the same hover affordance as the official fish, which
 * swims on hover rather than always. The gif artwork carries splash headroom
 * above the whale, so its ink mass sits low in the square frame; render at
 * 0.97x the requested size and lift the box to center the whale on the
 * headline line.
 * @param props - Host-supplied mark presentation.
 * @returns the hero mark element.
 */
export function OfficialHeroMark({ size, className }: HeroBrandMarkOwnerProps) {
  const [hovering, setHovering] = useState(false)
  const dim = Math.round(size * 0.97)
  return (
    <img
      src={hovering ? datasecureWaving : datasecurePoster}
      width={dim}
      height={dim}
      className={className}
      alt=""
      draggable={false}
      style={{ position: 'relative', top: -Math.round(size * 0.12) }}
      onMouseEnter={() => {
        if (window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) {
          setHovering(true)
        }
      }}
      onMouseLeave={() => { setHovering(false) }}
    />
  )
}

/**
 * Render the official name artwork without its independently slotted mark.
 * @returns the official name wordmark.
 */
export function OfficialBrandName() {
  return <BrandWordmark includeMark={false} />
}
