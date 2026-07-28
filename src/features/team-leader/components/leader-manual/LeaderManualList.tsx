import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import LeaderReceivePoManual from './LeaderReceivePoManual';

function scrollToHash(hash: string) {
  const sectionId = hash.replace(/^#/, '');
  if (!sectionId) return;

  window.requestAnimationFrame(() => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

export default function LeaderManualList() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      scrollToHash(location.hash);
    }
  }, [location.hash, location.key]);

  return (
    <div className="flex flex-col items-center p-4">
      <section id="manual-top" className="w-full max-w-2xl scroll-mt-4 text-center">
        <h1 className="text-2xl font-bold text-gray-700">Team Leader Manual - How to use?</h1>
        <p>This guide explains how team leaders should use the leader tools in the system.</p>
      </section>
      <br />

      <LeaderReceivePoManual />
    </div>
  );
}