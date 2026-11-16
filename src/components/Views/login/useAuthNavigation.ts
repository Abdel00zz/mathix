import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type AuthScreen = 'landing' | 'preview' | 'registration' | 'connection';
export type AuthRoute = { screen: AuthScreen; role: 'student' | 'prof'; step: 1 | 2 };

export function readAuthRoute(state: unknown): AuthRoute {
  const value = state as { monProfAuth?: string; role?: string; authStep?: number } | null;
  const role: 'student' | 'prof' = value?.role === 'prof' ? 'prof' : 'student';
  const rawScreen = value?.monProfAuth;
  const screen: AuthScreen = (
    rawScreen === 'registration'
    || rawScreen === 'connection'
    || (rawScreen === 'preview' && role === 'prof')
  ) ? rawScreen : 'landing';
  return {
    screen,
    role,
    step: screen === 'registration' && role === 'student' && value?.authStep === 2 ? 2 : 1,
  };
}

/** Les boutons de l'interface et ceux du navigateur utilisent le même état. */
export function useAuthNavigation() {
  const [route, setRoute] = useState(() => readAuthRoute(window.history.state));
  const routeRef = useRef(route);
  const pushedStepTwoRef = useRef(false);

  useEffect(() => {
    const restore = (event: PopStateEvent) => {
      const next = readAuthRoute(event.state);
      routeRef.current = next;
      if (next.step === 1) pushedStepTwoRef.current = false;
      setRoute(next);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  const navigate = useCallback((screen: AuthScreen, role = routeRef.current.role, step: 1 | 2 = 1, replace = false) => {
    const current = routeRef.current;
    const normalizedStep: 1 | 2 = screen === 'registration' && role === 'student' && step === 2 ? 2 : 1;
    const normalizedScreen: AuthScreen = screen === 'preview' && role !== 'prof' ? 'landing' : screen;
    if (normalizedScreen === current.screen && role === current.role && normalizedStep === current.step) return;

    if (
      !replace
      && current.screen === 'registration'
      && current.step === 2
      && normalizedScreen === 'registration'
      && normalizedStep === 1
      && pushedStepTwoRef.current
      && typeof window.history.back === 'function'
    ) {
      pushedStepTwoRef.current = false;
      window.history.back();
      return;
    }

    const hashUrl = typeof window.location !== 'undefined'
      ? `${window.location.pathname || ''}${window.location.search || ''}#login`
      : '#login';
    const nextState = {
      ...(window.history.state || {}),
      view: 'login',
      monProfAuth: normalizedScreen,
      role,
      authStep: normalizedStep,
    };
    if (replace) {
      window.history.replaceState(nextState, '', hashUrl);
    } else {
      pushedStepTwoRef.current = normalizedScreen === 'registration' && normalizedStep === 2;
      window.history.pushState(nextState, '', hashUrl);
    }
    const nextRoute: AuthRoute = { screen: normalizedScreen, role, step: normalizedStep };
    routeRef.current = nextRoute;
    setRoute(nextRoute);
  }, []);

  return useMemo(() => ({ ...route, navigate }), [route, navigate]);
}
