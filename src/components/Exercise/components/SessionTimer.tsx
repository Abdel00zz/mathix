
import React, { memo, useState, useEffect, useMemo } from 'react';
import { faCalendar } from '@fortawesome/free-regular-svg-icons';
import { FaIcon } from '../../UI/FaIcon';

interface SessionTimerProps {
    sessionDate: string;
}

const LiveDot = ({ subtle = false }: { subtle?: boolean }) => (
    <span className="relative inline-flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden="true">
        {!subtle && <span className="absolute inline-flex h-full w-full rounded-full bg-[#b54343]/60 animate-ping" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${subtle ? 'bg-[#b54343]/70' : 'bg-[#b54343]'} shadow-[0_0_6px_rgba(181,67,67,0.55)]`} />
    </span>
);

const SessionTimer = memo(({ sessionDate }: SessionTimerProps) => {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    const sessionInfo = useMemo(() => {
        const sessionTime = new Date(sessionDate);
        const diff = now.getTime() - sessionTime.getTime();
        const diffMinutes = diff / (1000 * 60);

        const casablancaOptions: Intl.DateTimeFormatOptions = { timeZone: 'Africa/Casablanca' };
        
        const isToday = now.toDateString() === sessionTime.toDateString();
        const dayStr = isToday ? "Aujourd'hui" : sessionTime.toLocaleDateString('fr-FR', { ...casablancaOptions, weekday: 'short', day: 'numeric', month: 'short' });
        const timeStr = sessionTime.toLocaleTimeString('fr-FR', { ...casablancaOptions, hour: '2-digit', minute: '2-digit' });

        if (diffMinutes >= 0 && diffMinutes <= 120) {
            return { status: 'live', label: 'EN DIRECT' };
        }
        if (diffMinutes < 0) {
            return { status: 'upcoming', label: `${dayStr} • ${timeStr}` };
        }
        return { status: 'ended', label: 'Terminé' };
    }, [sessionDate, now]);

    if (sessionInfo.status === 'live') {
        return (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#fdf0ee] text-[#b54343] border border-[#b54343]/25">
                <LiveDot />
                <span className="typo-ui font-semibold text-[0.68rem] uppercase tracking-[0.18em]">{sessionInfo.label}</span>
            </div>
        );
    }

    if (sessionInfo.status === 'upcoming') {
         return (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#fbfaf6] text-[#2c2b29] border border-[#e5e1d8]">
                <FaIcon icon={faCalendar} size={13} className="text-[#a8a39a]" />
                <span className="inline-flex items-center gap-2 typo-ui font-medium text-[0.72rem] tracking-wide">
                    <span>{sessionInfo.label}</span>
                    <span className="inline-flex items-center gap-1 text-[#b54343] font-semibold">
                        <LiveDot subtle />
                        <span className="text-[0.6rem] uppercase tracking-[0.18em]">TV</span>
                    </span>
                </span>
            </div>
        );
    }

    return (
        <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#fbfaf6] text-[#a8a39a] border border-[#e5e1d8]">
            <span className="typo-ui font-medium text-[0.72rem] tracking-wide">{sessionInfo.label}</span>
        </div>
    );
});

SessionTimer.displayName = 'SessionTimer';

export default SessionTimer;
