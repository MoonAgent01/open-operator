import { useAtom } from 'jotai';
import { browserTypeAtom, BrowserType } from '../atoms';

export default function BrowserSelector() {
  const [browserType, setBrowserType] = useAtom(browserTypeAtom);

  const handleBrowserChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as BrowserType;
    console.log(`[BrowserSelector] Changing browser type to: ${newType}`);
    setBrowserType(newType);
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="browser-select" className="text-sm text-gray-600 font-ppsupply">
        Browser:
      </label>
      <select
        id="browser-select"
        value={browserType}
        onChange={handleBrowserChange}
        className="px-2 py-1 rounded border border-gray-300 text-sm font-ppsupply bg-white"
      >
        <option value={BrowserType.Browserbase}>Browserbase</option>
        <option value={BrowserType.Native}>Native Browser</option>
      </select>
    </div>
  );
}
