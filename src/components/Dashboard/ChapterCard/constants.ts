export const CARD_TIMERS = {
    /** Unlock animation duration for a step that becomes available. */
    UNLOCK_ANIM: 1200,
} as const;

export const CARD_REVEAL = {
    /** Per-card reveal delay, capped for long chapter lists. */
    delay: (index: number) => `${Math.min(index * 60, 480)}ms`,
    /** JS fallback if IntersectionObserver never fires. */
    fallbackDelay: (index: number) => 180 + Math.min(index * 40, 360),
} as const;
