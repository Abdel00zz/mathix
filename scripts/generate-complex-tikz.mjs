import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(
  scriptDir,
  '../public/data/2eme-bac-sc-math/complexes/revisions/figures/tikz',
);

const preamble = String.raw`\documentclass[tikz,border=6pt]{standalone}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage{amsmath,amssymb}
\usetikzlibrary{arrows.meta,angles,quotes,calc,positioning}
\definecolor{axis}{HTML}{40515F}
\definecolor{grid}{HTML}{DDE4E8}
\definecolor{blue}{HTML}{3568D4}
\definecolor{coral}{HTML}{EF626C}
\definecolor{teal}{HTML}{2A9D8F}
\definecolor{gold}{HTML}{D89432}
\definecolor{purple}{HTML}{7357C8}
\tikzset{
  axisline/.style={axis, line width=.85pt, -{Stealth[length=3mm]}},
  guide/.style={axis!45, line width=.75pt, dashed},
  vector/.style={line width=1.5pt, -{Stealth[length=3mm]}},
  dot/.style={circle, fill=white, draw, line width=1.15pt, inner sep=2.15pt},
  label/.style={font=\large},
  smalllabel/.style={font=\normalsize}
}
\begin{document}
`;

const end = String.raw`\end{document}
`;

const figures = {
  'plan-complexe.tex': String.raw`
\begin{tikzpicture}[x=1cm,y=1cm]
  \draw[step=1cm,grid,very thin] (-1,-1) grid (8,5);
  \draw[axisline] (-1.2,0)--(8.35,0) node[below left,font=\large] {$\operatorname{Re}$};
  \draw[axisline] (0,-1.15)--(0,5.25) node[below right,font=\large] {$\operatorname{Im}$};
  \coordinate (O) at (0,0);
  \coordinate (M) at (5.7,3.6);
  \draw[guide,coral] (M)--(5.7,0);
  \draw[guide,teal] (M)--(0,3.6);
  \draw[vector,blue] (O)--(M);
  \draw[gold,line width=1.25pt] (1.25,0) arc[start angle=0,end angle=32.3,radius=1.25];
  \node[dot,draw=coral] at (M) {};
  \node[label,coral,above right=1pt of M] {$M(z)$};
  \node[smalllabel,coral,below] at (5.7,0) {$a$};
  \node[smalllabel,teal,left] at (0,3.6) {$b$};
  \node[label,blue,above left] at ($(O)!.56!(M)$) {$|z|$};
  \node[label,gold] at (1.55,.45) {$\theta$};
  \node[smalllabel,below left] at (O) {$O$};
\end{tikzpicture}
`,

  'symetrie-conjugue.tex': String.raw`
\begin{tikzpicture}[x=1cm,y=1cm]
  \draw[step=1cm,grid,very thin] (-1,-4.5) grid (8,4.5);
  \draw[axisline] (-1.2,0)--(8.35,0) node[below left,font=\large] {$\operatorname{Re}$};
  \draw[axisline] (0,-4.55)--(0,4.75) node[below right,font=\large] {$\operatorname{Im}$};
  \coordinate (O) at (0,0);
  \coordinate (M) at (5.4,3);
  \coordinate (Mb) at (5.4,-3);
  \draw[guide] (M)--(Mb);
  \draw[vector,blue] (O)--(M);
  \draw[vector,coral] (O)--(Mb);
  \node[dot,draw=blue] at (M) {};
  \node[dot,draw=coral] at (Mb) {};
  \node[label,blue,above right=1pt of M] {$M(z)$};
  \node[label,coral,below right=1pt of Mb] {$M'(\overline z)$};
  \node[smalllabel] at (5.4,.3) {$a$};
  \node[smalllabel,teal,left] at (0,3) {$b$};
  \node[smalllabel,coral,left] at (0,-3) {$-b$};
  \node[smalllabel,below left] at (O) {$O$};
\end{tikzpicture}
`,

  'addition-inegalite.tex': String.raw`
\begin{tikzpicture}[x=1cm,y=1cm]
  \draw[step=1cm,grid,very thin] (-1,-1) grid (9,6);
  \draw[axisline] (-1.2,0)--(9.25,0);
  \draw[axisline] (0,-1.15)--(0,6.2);
  \coordinate (O) at (0,0);
  \coordinate (A) at (4.1,1.7);
  \coordinate (B) at (2.7,4.4);
  \coordinate (C) at ($(A)+(B)$);
  \draw[axis!65,line width=.9pt] (O)--(A)--(C)--(B)--cycle;
  \draw[vector,blue] (O)--(A);
  \draw[vector,teal] (O)--(B);
  \draw[vector,coral] (O)--(C);
  \draw[gold,line width=1.15pt,dashed,-{Stealth[length=3mm]}] (A)--(B);
  \node[dot,draw=blue] at (A) {};
  \node[dot,draw=teal] at (B) {};
  \node[dot,draw=coral] at (C) {};
  \node[label,blue,below right=1pt of A] {$A(z)$};
  \node[label,teal,above left=1pt of B] {$B(w)$};
  \node[label,coral,above right=1pt of C] {$C(z+w)$};
  \node[label,gold,left] at ($(A)!.52!(B)$) {$w-z$};
  \node[smalllabel,below left] at (O) {$O$};
\end{tikzpicture}
`,

  'calcul-exponentiel-moivre.tex': String.raw`
\begin{tikzpicture}[x=1cm,y=1cm]
  \draw[step=1cm,grid,very thin] (-1,-1) grid (9,6);
  \draw[axisline] (-1.2,0)--(9.25,0) node[below left,font=\large] {$\operatorname{Re}$};
  \draw[axisline] (0,-1.15)--(0,6.2) node[below right,font=\large] {$\operatorname{Im}$};
  \coordinate (O) at (0,0);
  \coordinate (Z) at (4.8,1.7);
  \coordinate (W) at (3.1,3.7);
  \coordinate (ZW) at (3.6,5.35);
  \coordinate (ZN) at (0.4,5.4);
  \draw[vector,blue] (O)--(Z);
  \draw[vector,gold] (O)--(W);
  \draw[vector,coral] (O)--(ZW);
  \draw[vector,purple] (O)--(ZN);
  \draw[blue,line width=1.05pt] (1.2,0) arc[start angle=0,end angle=19.5,radius=1.2];
  \draw[gold,line width=1.05pt] (1.55,0) arc[start angle=0,end angle=50,radius=1.55];
  \draw[coral,line width=1.05pt] (1.9,0) arc[start angle=0,end angle=56,radius=1.9];
  \draw[purple,line width=1.05pt] (2.25,0) arc[start angle=0,end angle=85.8,radius=2.25];
  \node[dot,draw=blue] at (Z) {};
  \node[dot,draw=gold] at (W) {};
  \node[dot,draw=coral] at (ZW) {};
  \node[dot,draw=purple] at (ZN) {};
  \node[label,blue,below right=1pt of Z] {$z$};
  \node[label,gold,above right=1pt of W] {$w$};
  \node[label,coral,above right=1pt of ZW] {$zw$};
  \node[label,purple,above left=1pt of ZN] {$z^n$};
  \node[smalllabel,blue] at (1.35,.3) {$\theta$};
  \node[smalllabel,gold] at (1.45,.9) {$\varphi$};
  \node[smalllabel,coral] at (1.45,1.45) {$\theta+\varphi$};
  \node[smalllabel,purple] at (.62,2.2) {$n\theta$};
  \node[smalllabel,below left] at (O) {$O$};
\end{tikzpicture}
`,

  'racines-equations.tex': String.raw`
\begin{tikzpicture}[x=1cm,y=1cm]
  \draw[step=1cm,grid,very thin] (-5,-4) grid (5,4);
  \draw[axisline] (-5.2,0)--(5.3,0) node[below left,font=\large] {$\operatorname{Re}$};
  \draw[axisline] (0,-4.15)--(0,4.25) node[below right,font=\large] {$\operatorname{Im}$};
  \coordinate (O) at (0,0);
  \coordinate (D) at (-3.4,2.25);
  \coordinate (R) at (2.2,2.5);
  \coordinate (Rm) at (-2.2,-2.5);
  \draw[coral,line width=1.5pt,-{Stealth[length=3mm]}] (O)--(D);
  \draw[blue,line width=1.5pt,-{Stealth[length=3mm]}] (O)--(R);
  \draw[teal,line width=1.5pt,-{Stealth[length=3mm]}] (O)--(Rm);
  \draw[axis!35,line width=.85pt] (O) circle[radius=3.33];
  \node[dot,draw=coral] at (D) {};
  \node[dot,draw=blue] at (R) {};
  \node[dot,draw=teal] at (Rm) {};
  \node[label,coral,above left=1pt of D] {$\Delta$};
  \node[label,blue,above right=1pt of R] {$\delta$};
  \node[label,teal,below left=1pt of Rm] {$-\delta$};
  \node[smalllabel,below left] at (O) {$O$};
\end{tikzpicture}
`,

  'racines-niemes.tex': String.raw`
\begin{tikzpicture}[x=1cm,y=1cm]
  \draw[step=1cm,grid,very thin] (-5,-4) grid (5,4);
  \draw[axisline] (-5.2,0)--(5.3,0) node[below left,font=\large] {$\operatorname{Re}$};
  \draw[axisline] (0,-4.15)--(0,4.25) node[below right,font=\large] {$\operatorname{Im}$};
  \draw[axis!55,line width=.9pt] (0,0) circle[radius=3.2];
  \foreach \k in {0,...,5}{
    \coordinate (Z\k) at ({3.2*cos(18+60*\k)},{3.2*sin(18+60*\k)});
  }
  \draw[blue,line width=1.2pt,fill=blue!7] (Z0)--(Z1)--(Z2)--(Z3)--(Z4)--(Z5)--cycle;
  \foreach \k in {0,...,5}{
    \node[dot,draw=blue] at (Z\k) {};
    \node[smalllabel,blue] at ({3.75*cos(18+60*\k)},{3.75*sin(18+60*\k)}) {$z_{\k}$};
  }
  \draw[gold,line width=1.15pt] (1.35,0.44) arc[start angle=18,end angle=78,radius=1.42];
  \node[smalllabel,gold] at (1.1,1.25) {$\dfrac{2\pi}{n}$};
  \node[smalllabel,below left] at (0,0) {$O$};
\end{tikzpicture}
`,

  'geometrie-complexe.tex': String.raw`
\begin{tikzpicture}[x=1cm,y=1cm]
  \draw[step=1cm,grid,very thin] (-1,-1) grid (10,6);
  \coordinate (A) at (0.4,.4);
  \coordinate (B) at (6.2,1.2);
  \coordinate (C) at (4.5,5);
  \coordinate (D) at (.8,4.7);
  \draw[vector,blue] (A)--(B);
  \draw[vector,coral] (A)--(C);
  \draw[axis!60,line width=.9pt] (B)--(C)--(D)--(A);
  \draw[gold,line width=1.2pt] ($(A)+(1.45,.2)$) arc[start angle=7.9,end angle=47.5,radius=1.46];
  \node[dot,draw=axis] at (A) {};
  \node[dot,draw=blue] at (B) {};
  \node[dot,draw=coral] at (C) {};
  \node[dot,draw=teal] at (D) {};
  \node[label,below left=1pt of A] {$A(a)$};
  \node[label,blue,below right=1pt of B] {$B(b)$};
  \node[label,coral,above right=1pt of C] {$C(c)$};
  \node[label,teal,above left=1pt of D] {$D(d)$};
  \node[label,gold] at (1.85,1.3) {$\theta$};
  \node[smalllabel,blue,below] at ($(A)!.52!(B)$) {$\overrightarrow{AB}$};
  \node[smalllabel,coral,left] at ($(A)!.55!(C)$) {$\overrightarrow{AC}$};
\end{tikzpicture}
`,

  'transformations-complexes.tex': String.raw`
\begin{tikzpicture}[x=1cm,y=1cm]
  \begin{scope}[shift={(0,0)}]
    \node[font=\large\bfseries,teal] at (1.7,4.7) {Translation};
    \coordinate (M) at (.2,1.1);
    \coordinate (Mp) at (3.2,3.2);
    \draw[vector,teal] (M)--(Mp);
    \node[dot,draw=axis] at (M) {};
    \node[dot,draw=teal] at (Mp) {};
    \node[label,below left=1pt of M] {$M$};
    \node[label,teal,above right=1pt of Mp] {$M'$};
    \node[label,teal] at (1.55,2.45) {$\vec u$};
  \end{scope}
  \begin{scope}[shift={(4.7,0)}]
    \node[font=\large\bfseries,blue] at (1.7,4.7) {Homoth\'etie};
    \coordinate (O) at (.2,1.1);
    \coordinate (M) at (1.75,2.1);
    \coordinate (Mp) at (3.55,3.25);
    \draw[guide] (O)--(Mp);
    \draw[vector,blue] (O)--(M);
    \draw[vector,coral] (O)--(Mp);
    \node[dot,draw=axis] at (O) {};
    \node[dot,draw=blue] at (M) {};
    \node[dot,draw=coral] at (Mp) {};
    \node[label,below left=1pt of O] {$\Omega$};
    \node[label,blue,below right=1pt of M] {$M$};
    \node[label,coral,above right=1pt of Mp] {$M'$};
  \end{scope}
  \begin{scope}[shift={(9.5,0)}]
    \node[font=\large\bfseries,gold] at (1.7,4.7) {Rotation};
    \coordinate (O) at (.2,1.1);
    \coordinate (M) at (3.15,1.65);
    \coordinate (Mp) at (1.8,3.65);
    \draw[vector,blue] (O)--(M);
    \draw[vector,gold] (O)--(Mp);
    \draw[gold,line width=1.15pt] ($(O)+(1.25,.23)$) arc[start angle=10.5,end angle=58.5,radius=1.27];
    \node[dot,draw=axis] at (O) {};
    \node[dot,draw=blue] at (M) {};
    \node[dot,draw=gold] at (Mp) {};
    \node[label,below left=1pt of O] {$\Omega$};
    \node[label,blue,below right=1pt of M] {$M$};
    \node[label,gold,above right=1pt of Mp] {$M'$};
    \node[label,gold] at (1.35,1.8) {$\theta$};
  \end{scope}
\end{tikzpicture}
`,
};

fs.mkdirSync(outputDir, { recursive: true });
for (const [name, body] of Object.entries(figures)) {
  fs.writeFileSync(path.join(outputDir, name), `${preamble}${body}${end}`, 'utf8');
}

console.log(`Generated ${Object.keys(figures).length} TikZ sources in ${outputDir}`);
