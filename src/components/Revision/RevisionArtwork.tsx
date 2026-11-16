import React from 'react';

/** Decorative only: these drawings never add mathematical assertions to a lesson. */
export function RevisionBackground({ type, content }: { type: string; content: string }) {
  const text = content.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let drawing: React.ReactNode;
  if (/vecteur|triangle|angle|rotation|projection|scalaire|geometri/.test(text)) {
    drawing = <><circle cx="91" cy="60" r="42" /><path d="M49 65L113 24L122 88ZM91 60L113 24M91 60L122 88" /><path d="M48 98H139M134 93l5 5-5 5" /><circle cx="113" cy="24" r="3" /><circle cx="49" cy="65" r="3" /></>;
  } else if (/ensemble|intersection|reunion|inclusion|\\cap|\\cup/.test(text)) {
    drawing = <><rect x="25" y="15" width="123" height="93" rx="10" /><circle cx="73" cy="62" r="30" /><circle cx="108" cy="62" r="30" /><path d="M82 40L99 83M77 49L93 88M89 36L104 73" strokeDasharray="2 5" /></>;
  } else if (/probabilite|evenement|aleatoire|denombrement/.test(text)) {
    drawing = <><path d="M25 60L70 30L128 15M70 30L128 47M25 60L70 90L128 74M70 90L128 108" /><circle cx="25" cy="60" r="4" /><circle cx="70" cy="30" r="4" /><circle cx="70" cy="90" r="4" /><path d="M134 15h7M134 47h7M134 74h7M134 108h7" /></>;
  } else if (/suite|arithmetique|geometrique/.test(text)) {
    drawing = <><path d="M24 100H145M30 100V17" /><path d="M40 85L64 74L88 57L112 36L136 13" strokeDasharray="3 5" /><circle cx="40" cy="85" r="4" /><circle cx="64" cy="74" r="4" /><circle cx="88" cy="57" r="4" /><circle cx="112" cy="36" r="4" /><circle cx="136" cy="13" r="4" /></>;
  } else if (/fonction|derive|derivab|tangente|limite|continu|integrale|primitive|logarithme|exponentielle/.test(text)) {
    drawing = <><path d="M23 99H147M36 109V15M31 20l5-5 5 5M142 94l5 5-5 5" /><path d="M40 88C72 89 84 76 97 54S122 22 143 24" strokeWidth="2" /><path d="M65 104L126 8M97 54V99" strokeDasharray="4 5" /><circle cx="97" cy="54" r="4" /></>;
  } else if (['method', 'technique', 'application', 'example', 'proof', 'solution'].includes(type)) {
    drawing = <><rect x="26" y="76" width="28" height="27" rx="6" /><rect x="70" y="45" width="28" height="27" rx="6" /><rect x="114" y="14" width="28" height="27" rx="6" /><path d="M54 89H64V58H70M98 58H108V27H114M35 89l5 5 8-11M79 58l5 5 8-11M123 27l5 5 8-11" /></>;
  } else {
    drawing = <><path d="M28 28Q59 16 85 33Q111 16 142 28V99Q111 87 85 104Q59 87 28 99ZM85 33V104M41 43l29 3M41 57l29 3M100 46l28-3M100 60l28-3M100 74l19-2" /><path d="M49 73l7 7 13-13" /></>;
  }
  return <svg className="revision-card-art" viewBox="0 0 160 120" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{drawing}</svg>;
}

export function QuestionGlyph() {
  return <span className="revision-question-glyph revision-question-char">?</span>;
}
