import { useMemo } from 'react';
import { renderTags } from '@/lib/renderer';

interface FormattedTextRendererProps {
  text: string;
  className?: string;
}

export function FormattedTextRenderer({
  text,
  className = '',
}: FormattedTextRendererProps) {
  const renderedHtml = useMemo(() => {
    if (!text) return '';
    return renderTags(text);
  }, [text]);

  if (!text) return null;

  return (
    <div
      className={`formatted-text ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
