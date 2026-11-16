
/** Décore les vrais signes de ponctuation, sans toucher aux formules KaTeX. */
export function decorateMathQuestionMarks(root: HTMLElement): void {
  if (!root.querySelector('.math-mathqst')) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.data.includes('?') && !node.parentElement?.closest('.math-inline-node, .math-display-node, .katex, .revision-question-mark')) nodes.push(node);
  }
  for (const node of nodes) {
    const fragment = document.createDocumentFragment();
    node.data.split('?').forEach((part, index) => {
      if (index > 0) {
        const mark = document.createElement('span');
        mark.className = 'revision-question-mark mathqst-question-mark';
        mark.textContent = '?';
        fragment.appendChild(mark);
      }
      if (part) fragment.appendChild(document.createTextNode(part));
    });
    node.replaceWith(fragment);
  }
}
