import React, { memo } from 'react';

const DashboardBackground: React.FC = () => {
  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none select-none print:hidden overflow-hidden transition-colors duration-500"
      style={{ backgroundImage: 'linear-gradient(to bottom right, var(--reading-page-from), var(--reading-page-via), var(--reading-page-to))' }}
    >
      {/* Soft warm ivory & subtle amber/emerald ambient orbs */}
      <div className="absolute top-[-15%] right-[-8%] w-[55%] h-[65%] bg-[radial-gradient(ellipse_at_center,_rgba(217,119,6,0.04)_0%,_rgba(217,119,6,0.01)_45%,_transparent_75%)] opacity-95" />
      <div className="absolute bottom-[-12%] left-[-12%] w-[65%] h-[75%] bg-[radial-gradient(ellipse_at_center,_rgba(16,185,129,0.03)_0%,_rgba(16,185,129,0.01)_40%,_transparent_70%)] opacity-90" />
      <div className="absolute top-[30%] left-[20%] w-[35%] h-[45%] bg-[radial-gradient(ellipse_at_center,_rgba(217,119,6,0.02)_0%,_transparent_80%)] opacity-80" />
      
      {/* Subtle warm ardoise dot pattern for premium paper texture */}
      <div
        className="absolute inset-0 opacity-[0.20]"
        style={{
          backgroundImage: 'radial-gradient(#64748b 0.8px, transparent 0.8px)',
          backgroundSize: '28px 28px'
        }}
      />
    </div>
  );
};

export default memo(DashboardBackground);
