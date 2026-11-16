'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Award, BookOpen, Compass, FileText, HelpCircle } from 'lucide-react';
import { useApp } from './AppProvider';

export function MobileBottomNav() {
  const pathname = usePathname();
  const { setActiveModal } = useApp();

  const items = [
    { href: '/', label: 'Programme', icon: <BookOpen size={20} strokeWidth={2} aria-hidden="true" />, match: pathname === '/' },
    { href: '/examens', label: 'Examens', icon: <FileText size={20} strokeWidth={2} aria-hidden="true" />, match: pathname.startsWith('/examens') },
    { href: '/problemes', label: 'Problèmes', icon: <HelpCircle size={20} strokeWidth={2} aria-hidden="true" />, match: pathname.startsWith('/problemes') },
    { href: '/prepa', label: 'Prépa', icon: <Award size={20} strokeWidth={2} aria-hidden="true" />, match: pathname.startsWith('/prepa') },
  ];

  return (
    <nav className="mnav" aria-label="Navigation mobile">
      {items.map((it) => (
        <Link key={it.href} href={it.href} aria-current={it.match ? 'page' : undefined}>
          {it.icon}
          <span>{it.label}</span>
        </Link>
      ))}
      <button
        type="button"
        data-nav="menu"
        aria-label="Menu outils et paramètres"
        onClick={() => setActiveModal('mobileMenu')}
      >
        <Compass size={20} strokeWidth={2} aria-hidden="true" />
        <span>Menu</span>
      </button>
    </nav>
  );
}
