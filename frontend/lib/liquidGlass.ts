// Liquid glass refraction, adapted from liquid-glass.js
const SVG_NS = 'http://www.w3.org/2000/svg'
let uid = 0
let svgDefs: SVGDefsElement | null = null

export type GlassOptions = {
  scale?: number
  chroma?: number
  border?: number
  mapBlur?: number
  blur?: number
  saturate?: number
  radius?: number | null
  fallbackBlur?: number
}

// Chrome can refract the background; Safari and Firefox get frosted glass instead
function isSupported() {
  const ua = navigator.userAgent
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)
  if (isSafari || /Firefox/.test(ua)) return false
  if (!CSS.supports('backdrop-filter', 'url(#lg)')) return false
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 4
    c.getContext('2d')!.getImageData(0, 0, 1, 1)
    return true
  } catch {
    return false
  }
}

function ensureDefs() {
  if (svgDefs && document.body.contains(svgDefs)) return svgDefs
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.position = 'absolute'
  svgDefs = document.createElementNS(SVG_NS, 'defs') as SVGDefsElement
  svg.appendChild(svgDefs)
  document.body.appendChild(svg)
  return svgDefs
}

function makeMap(w: number, h: number, radius: number, border: number, mapBlur: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  const gx = ctx.createLinearGradient(0, 0, w, 0)
  gx.addColorStop(0, 'rgb(0,0,0)')
  gx.addColorStop(1, 'rgb(255,0,0)')
  ctx.fillStyle = gx
  ctx.fillRect(0, 0, w, h)

  const gy = ctx.createLinearGradient(0, 0, 0, h)
  gy.addColorStop(0, 'rgb(0,0,0)')
  gy.addColorStop(1, 'rgb(0,0,255)')
  ctx.globalCompositeOperation = 'difference'
  ctx.fillStyle = gy
  ctx.fillRect(0, 0, w, h)

  ctx.globalCompositeOperation = 'source-over'
  const inset = border * Math.min(w, h)
  ctx.filter = `blur(${mapBlur}px)`
  ctx.fillStyle = 'rgba(128,128,128,0.93)'
  ctx.beginPath()
  ctx.roundRect(inset, inset, w - inset * 2, h - inset * 2, Math.max(radius - inset, 2))
  ctx.fill()
  ctx.filter = 'none'
  return canvas.toDataURL()
}

function buildFilter(id: string, scales: number[]) {
  const filter = document.createElementNS(SVG_NS, 'filter')
  filter.setAttribute('id', id)
  filter.setAttribute('x', '0')
  filter.setAttribute('y', '0')
  filter.setAttribute('width', '100%')
  filter.setAttribute('height', '100%')
  filter.setAttribute('color-interpolation-filters', 'sRGB')

  const feImage = document.createElementNS(SVG_NS, 'feImage')
  feImage.setAttribute('x', '0')
  feImage.setAttribute('y', '0')
  feImage.setAttribute('result', 'map')
  feImage.setAttribute('preserveAspectRatio', 'none')
  filter.appendChild(feImage)

  const keep = [
    '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
    '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
    '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
  ]
  const channels: string[] = []
  for (let i = 0; i < 3; i++) {
    const disp = document.createElementNS(SVG_NS, 'feDisplacementMap')
    disp.setAttribute('in', 'SourceGraphic')
    disp.setAttribute('in2', 'map')
    disp.setAttribute('scale', String(scales[i]))
    disp.setAttribute('xChannelSelector', 'R')
    disp.setAttribute('yChannelSelector', 'B')
    disp.setAttribute('result', 'd' + i)
    filter.appendChild(disp)

    const cm = document.createElementNS(SVG_NS, 'feColorMatrix')
    cm.setAttribute('in', 'd' + i)
    cm.setAttribute('type', 'matrix')
    cm.setAttribute('values', keep[i])
    cm.setAttribute('result', 'c' + i)
    filter.appendChild(cm)
    channels.push('c' + i)
  }

  const blend1 = document.createElementNS(SVG_NS, 'feBlend')
  blend1.setAttribute('in', channels[0])
  blend1.setAttribute('in2', channels[1])
  blend1.setAttribute('mode', 'screen')
  blend1.setAttribute('result', 'c01')
  filter.appendChild(blend1)

  const blend2 = document.createElementNS(SVG_NS, 'feBlend')
  blend2.setAttribute('in', 'c01')
  blend2.setAttribute('in2', channels[2])
  blend2.setAttribute('mode', 'screen')
  filter.appendChild(blend2)

  ensureDefs().appendChild(filter)
  return { filter, feImage }
}

function resolveRadius(el: HTMLElement, w: number, h: number, override: number | null) {
  if (override != null) return override
  const raw = getComputedStyle(el).borderTopLeftRadius || '0px'
  const v = parseFloat(raw) || 0
  return raw.trim().endsWith('%') ? (v / 100) * Math.min(w, h) : v
}

export function liquidGlass(el: HTMLElement, opts: GlassOptions = {}) {
  const o = {
    scale: -112, chroma: 6, border: 0.07, mapBlur: 12,
    blur: 3, saturate: 1.5, radius: null as number | null, fallbackBlur: 16,
    ...opts,
  }
  const style = el.style as CSSStyleDeclaration & { webkitBackdropFilter: string }

  if (!isSupported()) {
    const frosted = `blur(${o.fallbackBlur}px) saturate(${o.saturate})`
    style.backdropFilter = frosted
    style.webkitBackdropFilter = frosted
    return {
      supported: false,
      refresh: () => {},
      destroy: () => {
        style.backdropFilter = ''
        style.webkitBackdropFilter = ''
      },
    }
  }

  const id = 'lg-filter-' + ++uid
  const parts = buildFilter(id, [o.scale, o.scale + o.chroma, o.scale + 2 * o.chroma])

  const refresh = () => {
    const w = el.offsetWidth
    const h = el.offsetHeight
    if (!w || !h) return
    const radius = resolveRadius(el, w, h, o.radius)
    parts.feImage.setAttribute('href', makeMap(w, h, radius, o.border, o.mapBlur))
    parts.feImage.setAttribute('width', String(w))
    parts.feImage.setAttribute('height', String(h))
  }

  refresh()
  style.backdropFilter = `url(#${id}) blur(${o.blur}px) saturate(${o.saturate})`

  let timer: ReturnType<typeof setTimeout> | undefined
  const ro = new ResizeObserver(() => {
    clearTimeout(timer)
    timer = setTimeout(refresh, 120)
  })
  ro.observe(el)

  return {
    supported: true,
    refresh,
    destroy: () => {
      ro.disconnect()
      clearTimeout(timer)
      parts.filter.remove()
      style.backdropFilter = ''
    },
  }
}