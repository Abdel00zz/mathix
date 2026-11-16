import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n/I18nProvider';
import { initContentOverrides } from './services/contentOverrides';

// Précharge le manifest des overrides de contenu (publications admin) le plus
// tôt possible : les services de données l'attendent avant chaque fetch.
initContentOverrides();

// Import KaTeX and Font Awesome CSS locally to support Vite PWA precaching and prevent runtime style injection
import { config as faConfig } from '@fortawesome/fontawesome-svg-core';
import '@fortawesome/fontawesome-svg-core/styles.css';
import 'katex/dist/katex.min.css';
import './styles/index.css';

faConfig.autoAddCss = false;
import './styles/revision/revision-tokens.css';
import './styles/revision/revision-layout.css';
import './styles/revision/revision-lists.css';
import './styles/revision/revision-math-renderer.css';
import './styles/revision/tkz-tab.css';
import './styles/revision/revision-macros.css';
import './styles/revision/revision-blocks.css';
import './styles/revision/probleme.css';
import './styles/revision/pen-annotations.css';
import './styles/revision/focus-reveal.css';
import './styles/revision/revision-editorial.css';
import katex from 'katex';
// @ts-expect-error PWA virtual module is provided by Vite PWA plugin
import renderMathInElement from 'katex/dist/contrib/auto-render';

(window as any).katex = katex;
(window as any).renderMathInElement = renderMathInElement;
(window as any).__katexReady = true;
window.dispatchEvent(new Event('katex-ready'));

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Use concurrent features for better performance
root.render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
