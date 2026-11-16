import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string): string =>
    readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('Revision typography coherence (definition, property, warning, method, application)', () => {
    const blocksCss = readSource('src/styles/revision/revision-blocks.css');
    const editorialCss = readSource('src/styles/revision/revision-editorial.css');
    const layoutCss = readSource('src/styles/revision/revision-layout.css');
    const listsCss = readSource('src/styles/revision/revision-lists.css');
    const purposeCss = readSource('src/styles/revision/revision-purpose.css');
    const courseBlockTsx = readSource('src/components/Revision/CourseBlock.tsx');
    const blockHeaderTsx = readSource('src/components/Revision/BlockHeader.tsx');
    const focusOverlayTsx = readSource('src/components/Revision/FocusOverlay.tsx');

    it('removes calligraphic Cormorant Garamond italic overrides from method titles', () => {
        const methodBlocksMatch = blocksCss.match(/\.revision-method-holo[\s\S]*?\.revision-method-holo::before/);
        expect(methodBlocksMatch?.[0]).toBeTruthy();
        expect(methodBlocksMatch?.[0]).not.toContain('Cormorant Garamond');
        expect(methodBlocksMatch?.[0]).toContain('font-family: var(--font-display)');
        expect(methodBlocksMatch?.[0]).toContain('font-style: normal');

        const methodEditorialMatch = editorialCss.match(
            /\.revision-editorial :is\(\s*\.revision-section-title[\s\S]*?\}/,
        );
        expect(methodEditorialMatch?.[0]).toBeTruthy();
        expect(methodEditorialMatch?.[0]).not.toContain('Cormorant Garamond');
        expect(methodEditorialMatch?.[0]).toContain('font-style: normal');
        expect(editorialCss).toContain('.revision-method-holo');
        expect(editorialCss).toContain('.revision-application-header h4');
    });

    it('drops legacy centered method prose styling so method aligns with definition', () => {
        expect(blocksCss).not.toContain('revision-method-content-centered');
        expect(courseBlockTsx).not.toContain('revision-method-content-centered');
        expect(courseBlockTsx).toContain('isCoreRevealBox || isMethod');

        const applicationBranch = blockHeaderTsx.match(/if \(typeKey === 'application'\)[\s\S]*?return \([\s\S]*?\n {4}\}/);
        expect(applicationBranch?.[0]).toContain('<h4 className="typo-display');
        expect(blockHeaderTsx).toContain('<h4 className="m-0 typo-display');
    });

    it('unifies definition, property, warning, method, and application on the editorial Inter font system without serif inversion', () => {
        expect(layoutCss).toContain('--revision-practice-size: var(--revision-box-size)');
        expect(layoutCss).toContain('--revision-application-size: var(--revision-box-size)');
        expect(layoutCss).toContain('--revision-question-size: var(--revision-box-size)');

        expect(editorialCss).not.toContain('--font-exercise');
        expect(blocksCss).not.toContain('--font-exercise');
        expect(layoutCss).not.toContain('--font-exercise');
        expect(listsCss).not.toContain('--font-exercise');
        expect(purposeCss).not.toContain('--font-exercise');

        expect(editorialCss).toContain('font-family: var(--font-editorial-text);');
        expect(blocksCss).toContain('font-family: var(--font-editorial-text, var(--font-ui');
        expect(blocksCss).toContain('font-size: var(--revision-box-size');
        expect(editorialCss).toContain('.revision-surface .math-question');
        expect(listsCss).toContain('font-family: var(--font-editorial-text, var(--font-ui');
        expect(listsCss).toContain('var(--revision-box-size');
        expect(focusOverlayTsx).toContain('revision-editorial revision-surface');
    });

    it('keeps heading inline MathRenderer spans inheriting --font-display across definition, property, warning, method, and application', () => {
        expect(courseBlockTsx).toContain('className="revision-title-text revision-method-holo');
        expect(courseBlockTsx).toContain('className="revision-title-text inline"');
        expect(editorialCss).toContain(':is(.math-renderer, .math-renderer-flow, .math-renderer-inherit, .latex-text, .math-paragraph, p, .math-mathqst, .mathqst-colored)');
        expect(blocksCss).toContain('font-family: var(--font-display, var(--font-editorial-text, var(--font-ui))) !important;');
        expect(blocksCss).toContain(':is(.math-renderer, .math-renderer-flow, .math-renderer-inherit, .latex-text, .math-paragraph, p, .math-mathqst, .mathqst-colored)');
    });

    it('renders method blocks uncentered and without any nested box frame around content', () => {
        expect(courseBlockTsx).not.toContain('isMethod ? \'text-center');
        expect(courseBlockTsx).toContain('revision-method-cue');
        expect(blocksCss).not.toContain('text-align: center !important');
        expect(blocksCss).toContain('.revision-reveal-method .revision-reveal-content-shell');

        const methodShellMatch = blocksCss.match(/\.revision-reveal-method \.revision-reveal-content-shell\s*\{[\s\S]*?\}/);
        expect(methodShellMatch?.[0]).toContain('background: transparent !important');
        expect(methodShellMatch?.[0]).toContain('border: 0 !important');
        expect(methodShellMatch?.[0]).toContain('box-shadow: none !important');

        expect(editorialCss).toContain('.revision-reveal-card:not(.revision-reveal-method)');
        expect(editorialCss).toContain('.revision-reveal-header:not(.revision-method-header)');
        expect(layoutCss).toContain('.revision-reveal-method .revision-reveal-content-shell');
        expect(layoutCss).toContain('.revision-method-cue');
    });

    it('keeps paragraph index with dot, list/exercise numbers dot-free, method with 4 rounded corners, application with tinted background zone, and warning without badge pill or side dash', () => {
        const sectionBlockTsx = readSource('src/components/Revision/RevisionSectionBlock.tsx');
        const questionNumberTsx = readSource('src/components/Exercise/components/QuestionNumber.tsx');
        const subQuestionLabelTsx = readSource('src/components/Exercise/components/SubQuestionLabel.tsx');

        expect(sectionBlockTsx).toContain('`${alphabeticIndex(index || 1)}.`');
        expect(questionNumberTsx).not.toContain('{number}.');
        expect(subQuestionLabelTsx).not.toContain('{label}.');

        const methodCardMatch = blocksCss.match(/\.revision-reveal-method,\s*\.revision-reveal-method\.revision-card-collapsed[\s\S]*?\}/);
        expect(methodCardMatch?.[0]).toContain('border-radius: 16px !important');

        expect(editorialCss).toContain('rgba(239, 246, 255');
        expect(editorialCss).toContain('border-radius: 16px !important');

        const warningBranch = blockHeaderTsx.match(/if \(typeKey === 'warning'\)[\s\S]*?\n {4}\}/);
        expect(warningBranch?.[0]).not.toContain('<RevisionBadge');
        expect(warningBranch?.[0]).not.toContain('revision-warning-dash');
        expect(warningBranch?.[0]).toContain('revision-warning-label');
    });
});
