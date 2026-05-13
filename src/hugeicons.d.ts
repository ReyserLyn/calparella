/**
 * Declaraciones de tipos para imports individuales de @hugeicons/core-free-icons.
 *
 * Cada icono exporta un array de tuplas SVG:
 *   type SVGElementTuple = [tag: 'path' | 'circle', attrs: Record<string, string>]
 *
 * Uso:
 *   import HeartIcon from '@hugeicons/core-free-icons/HeartIcon'
 *   <Icon data={HeartIcon} size={24} class="text-primary" />
 */
declare module '@hugeicons/core-free-icons/*' {
  type SVGElementTuple = [tag: 'path' | 'circle', attrs: Record<string, string>]
  const icon: SVGElementTuple[]
  export default icon
}
