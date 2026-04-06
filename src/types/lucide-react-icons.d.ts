declare module 'lucide-react/dist/esm/icons/*' {
  import type {
    ForwardRefExoticComponent,
    RefAttributes,
    SVGProps,
  } from 'react';

  export interface LucideProps
    extends Partial<Omit<SVGProps<SVGSVGElement>, 'ref'>> {
    size?: string | number;
    absoluteStrokeWidth?: boolean;
  }

  export type LucideIcon = ForwardRefExoticComponent<
    LucideProps & RefAttributes<SVGSVGElement>
  >;

  const Icon: LucideIcon;
  export default Icon;
}
