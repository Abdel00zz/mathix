import React from 'react';
import { config as faConfig, type IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon, type FontAwesomeIconProps } from '@fortawesome/react-fontawesome';

// Prevent runtime <style> DOM injection during SSR/Vitest or strict CSP environments
faConfig.autoAddCss = false;

export interface FaIconProps extends Omit<FontAwesomeIconProps, 'icon' | 'size'> {
    icon: IconDefinition;
    size?: number | string;
}

/**
 * Unified Font Awesome SVG icon wrapper with crisp numeric sizing support.
 * Keeps `lucide-react`-compatible `size` ergonomics while rendering tree-shaken FA SVGs.
 */
export const FaIcon: React.FC<FaIconProps> = ({
    icon,
    size,
    style,
    className = '',
    ...rest
}) => {
    const resolvedSize = typeof size === 'number' ? `${size}px` : size;
    const mergedStyle: FontAwesomeIconProps['style'] = resolvedSize
        ? { fontSize: resolvedSize, width: '1em', height: '1em', ...style }
        : style;

    return (
        <FontAwesomeIcon
            icon={icon}
            style={mergedStyle}
            className={`shrink-0 inline-block align-middle ${className}`.trim()}
            {...rest}
        />
    );
};
