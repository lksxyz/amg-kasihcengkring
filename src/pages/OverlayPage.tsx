import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { KASIH_ADDRESS, KASIH_ABI } from '../contract';
import { overlayClient } from '../lib/overlay-client';
import { formatUsdc } from '../lib/utils';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DISPLAY_MS = 8000;
const MAX_QUEUE = 5;

interface OverlayDonation {
  key: string;
  username: string;
  donorName: string;
  message: string;
  amount: bigint;
  /** True for logs delivered live; backfill cards are dropped when a live one arrives. */
  live: boolean;
}

export default function OverlayPage() {
  const { username } = useParams<{ username?: string }>();
  const [queue, setQueue] = useState<OverlayDonation[]>([]);
  const [pollFallback, setPollFallback] = useState(false);
  const seen = useRef(new Set<string>());
  const sound = useRef<HTMLAudioElement | null>(null);
  const filter = username?.toLowerCase();

  useEffect(() => {
    const audio = new Audio(`${import.meta.env.BASE_URL}notification-sound.mp3`);
    audio.preload = 'auto';
    audio.volume = 0.8;
    sound.current = audio;
    return () => {
      audio.pause();
      sound.current = null;
    };
  }, []);

  // Browsers block playback until a gesture; OBS browser sources usually allow it.
  // Unlock once on the first click/keypress so a browser preview can play too.
  useEffect(() => {
    const unlock = () => {
      const audio = sound.current;
      if (!audio) return;
      const volume = audio.volume;
      audio.volume = 0;
      void audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
        })
        .catch(() => {})
        .finally(() => {
          audio.volume = volume;
        });
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const playSound = useCallback(() => {
    const audio = sound.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch((error) => {
      console.warn('[overlay] notification sound was blocked', error);
    });
  }, []);

  useEffect(() => {
    const bodyBackground = document.body.style.background;
    const htmlBackground = document.documentElement.style.background;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.background = bodyBackground;
      document.documentElement.style.background = htmlBackground;
      document.body.style.overflow = bodyOverflow;
    };
  }, []);

  const enqueue = useCallback(
    (
      logs: readonly {
        transactionHash: string | null;
        logIndex: number | null;
        args?: {
          username?: string;
          donorName?: string;
          message?: string;
          amount?: bigint;
          timestamp?: bigint;
        };
      }[],
      live: boolean
    ) => {
      const incoming: OverlayDonation[] = [];
      for (const log of logs) {
        const args = log.args;
        if (!args) continue;
        const key = `${log.transactionHash}:${log.logIndex}`;
        if (seen.current.has(key)) continue;
        const donationUsername = String(args.username ?? '');
        if (filter && donationUsername.toLowerCase() !== filter) continue;
        seen.current.add(key);
        incoming.push({
          key,
          username: donationUsername,
          donorName: String(args.donorName ?? '').trim() || 'Anonymous',
          message: String(args.message ?? '').trim(),
          amount: args.amount ?? 0n,
          live,
        });
      }
      if (incoming.length === 0) return;
      setQueue((previous) => {
        // A live donation must never wait behind historical warm-up cards: drop
        // any queued backfill (including the one on screen) and show it now.
        const next = live ? previous.filter((item) => item.live) : [...previous];
        next.push(...incoming);
        return next.slice(-MAX_QUEUE);
      });
      // Backfill is silent: a page load should not fire an alert for old donations.
      if (live) playSound();
    },
    [filter, playSound]
  );

  useEffect(() => {
    if (KASIH_ADDRESS === ZERO_ADDRESS) return;
    let cancelled = false;
    void (async () => {
      try {
        const latest = await overlayClient.getBlockNumber();
        const span = 5000n;
        const fromBlock = latest > span ? latest - span : 0n;
        const logs = await overlayClient.getContractEvents({
          address: KASIH_ADDRESS,
          abi: KASIH_ABI,
          eventName: 'DonationReceived',
          fromBlock,
          toBlock: latest,
        });
        if (cancelled) return;
        const cutoff = BigInt(Math.floor(Date.now() / 1000) - 900);
        enqueue(
          logs.filter((log) => (log.args.timestamp ?? 0n) >= cutoff).slice(-3),
          false
        );
      } catch {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enqueue]);

  useEffect(() => {
    if (KASIH_ADDRESS === ZERO_ADDRESS) return;
    const unwatch = overlayClient.watchContractEvent({
      address: KASIH_ADDRESS,
      abi: KASIH_ABI,
      eventName: 'DonationReceived',
      onLogs: (logs) => enqueue(logs, true),
      // A broken WS subscription should degrade to HTTP polling, not a silent overlay.
      onError: (error) => {
        console.warn('[overlay] live subscription failed; falling back to polling', error);
        setPollFallback(true);
      },
      ...(pollFallback ? { poll: true, pollingInterval: 3000 } : {}),
    });
    return () => unwatch();
  }, [enqueue, pollFallback]);

  const current = queue[0] ?? null;

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setQueue((previous) => previous.slice(1)), DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [current]);

  if (KASIH_ADDRESS === ZERO_ADDRESS) {
    return (
      <div className="grid min-h-dvh place-items-center p-8 text-center text-sm text-white/60">
        Contract not deployed. Set VITE_KASIH_ADDRESS.
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
        <AnimatePresence mode="wait">
          {current && (
            <motion.div
              key={current.key}
              initial={{ opacity: 0, y: 36, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -24, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
              className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/15 bg-black/70 text-center text-white shadow-2xl backdrop-blur-xl"
            >
              <div className="flex items-center justify-center gap-2 border-b border-white/10 px-6 py-3 text-xs uppercase tracking-[0.18em] text-white/50">
                <span className="h-1.5 w-1.5 rounded-full bg-[#c7f04a]" />
                New donation
              </div>

              <div className="space-y-3 px-8 py-7">
                <div className="text-5xl font-black tabular-nums text-[#c7f04a]">
                  {formatUsdc(current.amount)}
                  <span className="ml-2 text-xl font-semibold text-white/60">USDC</span>
                </div>

                <div className="text-xl font-bold">
                  {current.donorName}
                  <span className="mx-2 font-normal text-white/40">→</span>
                  <span className="text-[#c7f04a]">@{current.username}</span>
                </div>

                {current.message && (
                  <p className="mx-auto max-w-md text-pretty text-lg leading-snug text-white/85">
                    “{current.message}”
                  </p>
                )}
              </div>

              <motion.div
                key={`${current.key}-bar`}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: DISPLAY_MS / 1000, ease: 'linear' }}
                className="h-1 bg-[#c7f04a]"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="pointer-events-none absolute bottom-4 right-5 text-xs font-medium tracking-wide text-white/35">
        KasihCengkring
      </div>
    </div>
  );
}
