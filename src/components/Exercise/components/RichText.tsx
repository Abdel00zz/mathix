
import React, { memo } from 'react';
import MathRenderer from '../../MathRenderer';

interface RichTextProps {
    content: string;
    className?: string;
}

// Renders the text as math.
const RichText = memo(({ content, className = "" }: RichTextProps) => (
    <div className={className}>
        <MathRenderer
            inline
            content={content}
            enableKeywords={false}
            fontSize="inherit"
        />
    </div>
));

export default RichText;
