import IconLibrary from '@/components/market/IconLibrary';
import MarketHeader from '@/components/market/MarketHeader';
import PriceSection from '@/components/market/PriceSection';
import MacroSection from '@/components/market/MacroSection';
import MarketFooter from '@/components/market/MarketFooter';
import MarketDialogs from '@/components/market/MarketDialogs';
import LegacyScripts from '@/components/LegacyScripts';

export default function MarketPage() {
  return (
    <>
      <IconLibrary />
      <div className="app-shell">
        <MarketHeader />
        <main>
          <PriceSection />
          <MacroSection />
          <MarketFooter />
        </main>
      </div>
      <MarketDialogs />
      <LegacyScripts page="market" />
    </>
  );
}
