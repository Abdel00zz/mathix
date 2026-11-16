import React from 'react';
import { cookies } from 'next/headers';
import { ProgrammeHub } from '@/components/ProgrammeHub';
import { getHydratedProgramme, normalizeClassId } from '@/lib/content/serverContent';
import { CLASS_COOKIE } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const cookieStore = await cookies();
  const classId = normalizeClassId(cookieStore.get(CLASS_COOKIE)?.value);
  const programme = await getHydratedProgramme(classId);

  return (
    <ProgrammeHub
      classId={programme.classId}
      classTitle={programme.classTitle}
      chapters={programme.chapters}
    />
  );
}
