/**
 * Testnet strip — shown on every page for testnet builds only.
 *
 * It is the one place the UI admits "this is not real money" and points at Circle's
 * faucet. Mainnet builds render nothing, so the strip never appears on production.
 */
import { ArrowUpRight, FlaskConical } from 'lucide-react';
import { ARC_FAUCET_URL, IS_TESTNET } from '../network';

export default function TestnetBanner() {
  if (!IS_TESTNET) return null;

  return (
    <div className="testnet-banner" role="note">
      <div className="shell testnet-banner-inner">
        <span className="testnet-banner-tag">
          <FlaskConical className="size-3.5" aria-hidden="true" />
          Testnet
        </span>
        <span className="testnet-banner-copy">
          Arc Testnet — test USDC only, not real money.
        </span>
        <a
          className="testnet-banner-link"
          href={ARC_FAUCET_URL}
          target="_blank"
          rel="noreferrer"
        >
          Get testnet USDC
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
