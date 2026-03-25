import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import bgVideo from '../../assets/sapience.fun.mp4'
import sapienceLogo from '../../assets/sapiencelogo.jpeg'
import { useWalletAuth } from '../../context/walletAuth'

function AudioIcon({ muted }) {
  if (muted) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M11 2V3H10V4H9V5H8V6H7V7H6V8H1V16H6V17H7V18H8V19H9V20H10V21H11V22H14V2H11ZM3 10H7V9H8V8H9V7H10V6H11V5H12V19H11V18H10V17H9V16H8V15H7V14H3V10Z" />
        <path d="M22 8V10H21V11H20V13H21V14H22V16H20V15H19V14H18V15H17V16H15V14H16V13H17V11H16V10H15V8H17V9H18V10H19V9H20V8H22Z" />
      </svg>
    )
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M11 2V3H10V4H9V5H8V6H7V7H6V8H1V16H6V17H7V18H8V19H9V20H10V21H11V22H14V2H11ZM3 10H7V9H8V8H9V7H10V6H11V5H12V19H11V18H10V17H9V16H8V15H7V14H3V10Z" />
      <path d="M16 8V10H17V11H18V13H17V14H16V16H18V15H19V14H20V10H19V9H18V8H16Z" />
      <path d="M19 6V8H20V9H21V15H20V16H19V18H21V17H22V7H21V6H19Z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.5 10V9H16.5V8H17.5V7H18.5V6H19.5V5H20.5V4H21.5V3H22.5V2H19.5V3H18.5V4H17.5V5H16.5V6H15.5V7H14.5V8H12.5V7H11.5V6H10.5V4H9.5V3H8.5V2H1.5V3H2.5V4H3.5V5H4.5V7H5.5V8H6.5V10H7.5V11H8.5V13H9.5V14H8.5V15H7.5V16H6.5V17H5.5V18H4.5V19H3.5V20H2.5V21H1.5V22H4.5V21H5.5V20H6.5V19H7.5V18H8.5V17H9.5V16H11.5V17H12.5V18H13.5V20H14.5V21H15.5V22H22.5V21H21.5V20H20.5V19H19.5V17H18.5V16H17.5V14H16.5V13H15.5V11H14.5V10H15.5ZM15.5 14V15H16.5V17H17.5V18H18.5V20H15.5V18H14.5V17H13.5V16H12.5V14H11.5V13H10.5V12H9.5V10H8.5V9H7.5V7H6.5V6H5.5V4H8.5V5H9.5V7H10.5V8H11.5V10H12.5V11H13.5V12H14.5V14H15.5Z" />
    </svg>
  )
}

function DiscordIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 2 24 20" fill="currentColor" aria-hidden="true">
      <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.36-.76-.54-1.09c-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02c-2.72 4.07-3.47 8.03-3.1 11.95c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.24 2.65c.03.01.06 0 .07-.02c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78c-.04-.02-.04-.08-.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26c.04.03.04.09-.01.11c-.52.31-1.07.56-1.64.78c-.04.01-.05.06-.04.09c.32.61.68 1.19 1.07 1.74c.03.01.06.02.09.01c1.72-.53 3.45-1.33 5.25-2.65c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.83 2.12-1.89 2.12z" />
    </svg>
  )
}

function WelcomePage() {
  const navigate = useNavigate()
  const { connectWallet, isConnecting, isConnected, authError, clearAuthError } = useWalletAuth()
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    if (isConnected) {
      navigate('/prediction', { replace: true })
    }
  }, [isConnected, navigate])

  const handleConnectWallet = async () => {
    if (isConnecting) return
    clearAuthError()
    await connectWallet()
  }

  return (
    <main
      className="relative overflow-hidden bg-black text-[#d9e5df] antialiased"
      style={{
        boxSizing: 'border-box',
        height: '100dvh',
        paddingTop: 'var(--beta-banner-height, 0px)',
      }}
    >
      <div className="absolute inset-0 z-0">
        <video
          className="h-full w-full object-cover saturate-50 brightness-[0.95] contrast-[1.03]"
          autoPlay
          loop
          muted={muted}
          playsInline
          preload="auto"
          aria-hidden="true"
        >
          <source src={bgVideo} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-[#0b3d1d]/55 mix-blend-multiply" aria-hidden="true" />
        <div className="absolute inset-0 bg-black/35" aria-hidden="true" />
        <div className="absolute inset-0 bg-black/10" aria-hidden="true" />
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 3px)',
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,0.72)_100%)]"
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-b from-black/60 to-transparent" aria-hidden="true" />
      </div>

      <button
        className="absolute right-4 top-6 z-30 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/20 text-[#8dd8a4] backdrop-blur-sm transition hover:bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#13f227]/70 sm:right-6 sm:top-8 sm:h-12 sm:w-12"
        aria-label={muted ? 'Unmute video' : 'Mute video'}
        onClick={() => setMuted((value) => !value)}
      >
        <AudioIcon muted={muted} />
      </button>

      <div className="absolute left-1/2 top-8 z-20 -translate-x-1/2">
        <p className="netlifypixel text-center text-[28px] leading-none font-black tracking-[1px] [text-shadow:0_0_15px_rgba(0,0,0,0.5)] sm:text-[34px]">
          <span className="text-[#eaf4f0]">SAPIENCE.</span>
          <span className="text-[#13f227]">FUN</span>
        </p>
      </div>

      <section className="relative z-20 mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center text-balance text-center">
        <div
          className="relative mb-6 grid h-[100px] w-[100px] place-items-center rounded-[22px] border border-[#13f227]/35 bg-linear-to-b from-[#171717] to-[#0c0c0c] shadow-[0_0_25px_rgba(19,242,39,0.18),inset_0_0_16px_rgba(255,255,255,0.08)] before:absolute before:inset-0 before:rounded-[22px] before:bg-linear-to-b before:from-white/10 before:to-transparent before:opacity-60"
          aria-hidden="true"
        >
          <img
            src={sapienceLogo}
            alt="Sapience logo"
            className="absolute inset-0 z-10 h-full w-full rounded-[22px] object-cover"
          />
        </div>

        <h1 className="m-0 text-[clamp(48px,9vw,86px)] leading-[0.9] font-extrabold tracking-[-1.3px] text-[#f6fffa]">
          <span className="netlifypixel">Welcome to </span>
          <span className="netlifypixel text-[#13f227] [text-shadow:0_0_30px_rgba(19,242,39,0.9),0_0_50px_rgba(19,242,39,0.7),0_0_70px_rgba(19,242,39,0.5)]">
            Sapience
          </span>
        </h1>

        <p className="mx-auto mb-5 mt-3 max-w-md text-sm leading-[1.45] text-white/60 sm:mb-8 sm:text-base">
          Connect your wallet to explore markets, place predictions, and climb the leaderboard.
          We&apos;re glad you&apos;re here.
        </p>

        <div className="w-full max-w-md">
          <button
            type="button"
            disabled={isConnecting}
            onClick={handleConnectWallet}
            className="group relative block h-[48px] w-full cursor-pointer border-none bg-transparent p-0 text-base sm:h-[52px] sm:text-lg"
          >
            <span className="absolute left-0 top-0 h-full w-full translate-y-[2px] rounded-xl bg-black/30 transition-transform duration-300 group-hover:translate-y-[4px] group-active:translate-y-px" />
            <span className="absolute left-0 top-0 h-full w-full rounded-xl bg-[#0da91f]" />
            <span className="relative flex h-full -translate-y-[4px] items-center justify-center rounded-xl bg-[#13f227] px-3 font-bold text-[#08240e] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-transform duration-300 group-hover:-translate-y-[6px] group-active:-translate-y-[2px]">
              {isConnecting ? 'Connecting...' : 'Login with MetaMask'}
            </span>
          </button>
          {authError ? <p className="mt-3 text-center text-sm text-rose-300">{authError}</p> : null}
        </div>

        <div className="mt-4 flex items-center justify-center gap-3 sm:mt-8">
          <a
            className="text-white/45 transition-colors hover:text-white/80"
            href="https://x.com/sapiencedotfun"
            target="_blank"
            rel="noreferrer"
            aria-label="X"
          >
            <XIcon />
          </a>
          <a
            className="text-white/45 transition-colors hover:text-white/80"
            href="https://discord.gg/sapience"
            target="_blank"
            rel="noreferrer"
            aria-label="Discord"
          >
            <DiscordIcon />
          </a>
        </div>

        <p className="mt-2 text-xs text-white/45">
          Need help?{' '}
          <a
            className="text-white/60 underline decoration-white/30 underline-offset-2 transition-colors hover:text-white/85"
            href="https://discord.gg/sapience"
            target="_blank"
            rel="noreferrer"
          >
            Join our Discord.
          </a>
        </p>
      </section>
    </main>
  )
}

export default WelcomePage
