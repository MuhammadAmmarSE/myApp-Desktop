// The title bar: drag the window by it. Back and forward, where you are, the search box in the
// middle, and on the right the assistant's questions, Quick capture and (on Windows and Linux) the
// window's own buttons.
import { useEffect, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, Bell, Copy, Minus, Search, Square, X, Zap } from "lucide-react";
import { bridge, isMac, modKey } from "@/lib/bridge";
import { navigate, useLocation } from "@/lib/router";
import { pageFor } from "@/lib/nav";
import { IconButton } from "@/components/ui";
import { useUI } from "@/store/ui";
import { useOperator } from "@/store/operator";

const TITLES: Record<string, string> = { "/capture": "Capture", "/settings": "Settings", "/saved": "Saved text" };

export function TitleBar() {
  const { path } = useLocation();
  const openPalette = useUI((s) => s.openPalette);
  const approvals = useOperator((s) => s.approvals.length);
  const [win, setWin] = useState({ maximized: false, focused: true });
  const mac = isMac();
  useEffect(() => {
    void bridge.win.state().then((s) => setWin({ maximized: s.maximized, focused: s.focused }));
    return bridge.on("window", (s) => setWin({ maximized: s.maximized, focused: s.focused }));
  }, []);
  const page = pageFor(path);
  const title = TITLES[path] || page?.label || (path.startsWith("/notes/") ? "Notes" : path.startsWith("/assistant/") ? "Assistant" : "Redline");
  const Icon = page?.icon;

  return (
    <header
      className={clsx("drag relative z-30 flex shrink-0 items-center gap-2 border-b border-line pr-2 transition-opacity", !win.focused && "opacity-[0.86]")}
      style={{ height: "var(--titlebar-h)", paddingLeft: mac ? 84 : 12 }}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget && !mac) bridge.win.toggleMaximize();
      }}
    >
      <div className="no-drag flex items-center gap-0.5">
        <IconButton icon={ArrowLeft} label="Back" size="sm" kbd="Alt ←" onClick={() => history.back()} />
        <IconButton icon={ArrowRight} label="Forward" size="sm" kbd="Alt →" onClick={() => history.forward()} />
      </div>
      <div className="pointer-events-none flex min-w-0 items-center gap-2 pl-1 text-[13px] font-medium text-text2">
        {Icon && <Icon size={15} className="shrink-0 text-text3" />}
        <span className="truncate" data-testid="page-title">
          {title}
        </span>
      </div>

      <div className="absolute left-1/2 top-1/2 w-[min(440px,38vw)] -translate-x-1/2 -translate-y-1/2">
        <button
          type="button"
          onClick={() => openPalette()}
          className="no-drag group flex h-[30px] w-full items-center gap-2 rounded-[9px] bg-surface2/80 px-3 text-[12.5px] text-text3 hairline transition-[background-color,box-shadow] hover:bg-surface2 hover:text-text2 hover:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c-text3)_55%,transparent)]"
        >
          <Search size={14} />
          <span className="flex-1 truncate text-left">Search everything or jump to…</span>
          <kbd className="rounded-[5px] border border-line bg-surface px-1.5 font-sans text-[10.5px] text-text3">{modKey()} K</kbd>
        </button>
      </div>

      <div className="flex-1" />
      <div className="no-drag flex items-center gap-1">
        <div className="relative">
          <IconButton icon={Bell} label={approvals ? `${approvals} question${approvals === 1 ? "" : "s"} from the assistant` : "The assistant has no questions"} size="sm" onClick={() => navigate("/assistant")} />
          {approvals > 0 && <span className="pointer-events-none absolute right-0.5 top-0.5 grid h-[14px] min-w-[14px] place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">{approvals}</span>}
        </div>
        <IconButton icon={Zap} label="Quick capture window" kbd={`${modKey()} ⇧ Space`} size="sm" onClick={() => bridge.quick.open()} />
      </div>
      {!mac && (
        <div className="no-drag -mr-2 ml-2 flex h-full items-stretch">
          <button type="button" aria-label="Minimise" onClick={() => bridge.win.minimize()} className="grid w-[46px] place-items-center text-text2 transition-colors hover:bg-hover hover:text-text">
            <Minus size={15} />
          </button>
          <button type="button" aria-label={win.maximized ? "Restore" : "Maximise"} onClick={() => bridge.win.toggleMaximize()} className="grid w-[46px] place-items-center text-text2 transition-colors hover:bg-hover hover:text-text">
            {win.maximized ? <Copy size={13} className="-scale-x-100" /> : <Square size={12.5} />}
          </button>
          <button type="button" aria-label="Close" onClick={() => bridge.win.close()} className="grid w-[46px] place-items-center text-text2 transition-colors hover:bg-[#e81123] hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}
    </header>
  );
}
