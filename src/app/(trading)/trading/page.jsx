import IconLibrary from '@/components/trading/IconLibrary';
import TradingHeader from '@/components/trading/TradingHeader';
import TradingMain from '@/components/trading/TradingMain';
import SetupDialog from '@/components/trading/SetupDialog';
import LegacyScripts from '@/components/LegacyScripts';

export default function TradingPage() {
  return (
    <>
      <IconLibrary />
      <div className="app-shell">
        <TradingHeader />
        <TradingMain />
      </div>
      <SetupDialog />
      <LegacyScripts page="trading" />
    </>
  );
}
