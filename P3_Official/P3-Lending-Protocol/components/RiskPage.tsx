import React from 'react';
import { Footer } from './Footer';
import { LegalDocType } from './LegalModal';

const LAST_UPDATED = new Date().toISOString().split('T')[0];

export const RiskPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-200 flex flex-col">
      <div className="max-w-3xl mx-auto px-6 py-12 flex-1">
        <a href="/" className="text-[11px] text-zinc-500 hover:text-[#00e599] transition-colors mb-6 inline-block">← Back to Home</a>
        <p className="text-[10px] text-zinc-500 mb-1">Last updated: {LAST_UPDATED}</p>
        <p className="text-[10px] text-amber-500/90 mb-4">Draft for MVP / informational only — not legal advice.</p>
        <h1 className="text-2xl font-bold text-white mb-6">Risk Disclosures</h1>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-6">
          <h2 className="text-sm font-semibold text-zinc-300">Lending and borrowing</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Lending involves risk of loss; there is no guarantee of repayment.</li>
            <li>Risk scores are informational signals only, not a promise of outcome.</li>
          </ul>
        </section>

        <section className="space-y-3 text-[13px] text-zinc-400 leading-relaxed mb-6">
          <h2 className="text-sm font-semibold text-zinc-300">Volatility and crypto</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Digital assets can be highly volatile; value may change quickly.</li>
            <li>Participation in crypto-related activity carries additional risk.</li>
          </ul>
        </section>
      </div>
      <Footer onOpenLegal={(_t: LegalDocType) => {}} />
    </div>
  );
};
