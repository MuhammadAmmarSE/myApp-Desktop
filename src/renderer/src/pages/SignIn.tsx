// Sign in to your Redline server. The address is filled in (the same server as the phone); you can
// point it somewhere else under "Use a different server".
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, CalendarDays, Lock, Mail, Server, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { BrandMark } from "@/components/shell/BrandMark";
import { useAuth } from "@/store/auth";
import { bridge, isMac } from "@/lib/bridge";
import { ease } from "@/theme/motion";

const POINTS = [
  { icon: CalendarDays, title: "Your day at a glance", body: "To-dos, events, dates and reminders, together." },
  { icon: Sparkles, title: "Capture anything", body: "Type what someone told you; AI files it in the right place." },
  { icon: Wallet, title: "Money, car, things", body: "Spending, fuel and warranties, kept in order." },
  { icon: ShieldCheck, title: "Yours", body: "On your own server, in sync with your phone." },
];

export default function SignIn() {
  const notice = useAuth((s) => s.notice);
  const serverNow = useAuth((s) => s.server);
  const signIn = useAuth((s) => s.signIn);
  const [server, setServer] = useState(serverNow);
  const [other, setOther] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setServer(serverNow), [serverNow]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    setError("");
    const r = await signIn(server, email.trim(), password);
    setBusy(false);
    if (!r.ok) setError(r.message || "Couldn't sign in.");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="drag h-11 shrink-0" style={{ paddingLeft: isMac() ? 84 : 0 }}>
        {!isMac() && (
          <div className="no-drag float-right flex h-full">
            <button type="button" aria-label="Minimise" onClick={() => bridge.win.minimize()} className="w-[46px] text-text3 hover:bg-hover">
              –
            </button>
            <button type="button" aria-label="Close" onClick={() => bridge.win.close()} className="w-[46px] text-text3 hover:bg-[#e81123] hover:text-white">
              ×
            </button>
          </div>
        )}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
        <div className="relative hidden flex-col justify-center overflow-hidden px-16 lg:flex">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: ease.out }}>
            <BrandMark size={84} spin />
            <h1 className="mt-6 font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.03em]">
              Your day,
              <br />
              <span className="bg-gradient-to-r from-accent2 to-accent bg-clip-text text-transparent">on the big screen.</span>
            </h1>
            <p className="mt-4 max-w-[440px] text-[15px] leading-relaxed text-text2">Redline for the desktop, in step with your phone. Plan, capture and keep track with the keyboard.</p>
          </motion.div>
          <div className="mt-10 grid max-w-[520px] grid-cols-2 gap-3">
            {POINTS.map((p, i) => (
              <motion.div key={p.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: ease.out, delay: 0.15 + i * 0.07 }} className="glass rounded-[14px] border border-line p-4">
                <p.icon size={18} className="text-accent-text" />
                <div className="mt-2.5 text-[13.5px] font-semibold">{p.title}</div>
                <div className="mt-1 text-[12.5px] leading-snug text-text2">{p.body}</div>
              </motion.div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center px-8">
          <motion.form
            onSubmit={submit}
            initial={{ opacity: 0, y: 12, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: ease.out, delay: 0.05 }}
            className="glass-strong w-full max-w-[400px] rounded-[22px] border border-line p-8 shadow-[var(--shadow-pop)]"
            aria-label="Sign in"
          >
            <div className="mb-6 lg:hidden">
              <BrandMark size={48} />
            </div>
            <h2 className="font-display text-[24px] font-semibold tracking-[-0.02em]">Sign in</h2>
            <p className="mt-1 text-[13.5px] text-text2">With the account you use on your phone.</p>
            {notice && <div className="mt-4 rounded-[10px] bg-[color-mix(in_srgb,var(--c-warn)_14%,transparent)] px-3 py-2 text-[12.5px] text-warn">{notice}</div>}
            <div className="mt-6 flex flex-col gap-4">
              <Field label="Email">
                <Input icon={Mail} type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="username" autoFocus size="lg" aria-label="Email" />
              </Field>
              <Field label="Password">
                <Input icon={Lock} type="password" value={password} onChange={setPassword} placeholder="Your password" autoComplete="current-password" size="lg" aria-label="Password" />
              </Field>
              {other ? (
                <Field label="Server" hint="Your Redline server's address. https:// and /api are added if you leave them out.">
                  <Input icon={Server} value={server} onChange={setServer} placeholder="example.com" aria-label="Server" />
                </Field>
              ) : (
                <button type="button" onClick={() => setOther(true)} className="flex items-center gap-2 self-start text-[12.5px] text-text3 hover:text-text2">
                  <Server size={13} /> <span className="max-w-[300px] truncate">{server.replace(/^https?:\/\//, "").replace(/\/api$/, "")}</span> · Use a different server
                </button>
              )}
              {error && (
                <p role="alert" className="text-[13px] text-danger">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" size="lg" loading={busy} iconRight={ArrowRight} block className="mt-1">
                Sign in
              </Button>
            </div>
          </motion.form>
        </div>
      </div>
    </div>
  );
}
