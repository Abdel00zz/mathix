import React from 'react';
import MathRenderer from '../../MathRenderer';
import { RevisionBadge } from '../BlockHeader';
import '../../../styles/revision/revision-purpose.css';

interface CelaPermetDeBlockProps {
    content: string | string[];
    renderItem?: (item: string, index: number) => React.ReactNode;
    children?: React.ReactNode;
}

/** Chaque entrée est une compétence, pas une case de progression interactive. */
export default function CelaPermetDeBlock({ content, renderItem, children }: CelaPermetDeBlockProps) {
    const items = (Array.isArray(content) ? content : [content])
        .filter(item => renderItem || item.trim());

    return (
        <section className="revision-purpose-block" dir="ltr" lang="fr">
            <div className="revision-purpose-heading" role="heading" aria-level={4}>
                <RevisionBadge typeKey="cela_permet_de" label="Cela permet de :" />
            </div>
            <ul className="revision-purpose-list" role="list">
                {items.map((item, index) => (
                    <li className="revision-purpose-item" key={index}>
                        <span className="revision-purpose-bullet" aria-hidden="true" />
                        <div className="revision-purpose-text">
                            {renderItem
                                ? renderItem(item, index)
                                : <MathRenderer content={item} fontSize="inherit" enableLongPressHighlight />}
                        </div>
                    </li>
                ))}
            </ul>
            {children}
        </section>
    );
}
