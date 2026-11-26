// The password check before approving a step, where the computer has no fingerprint reader.
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button, Dialog, Input } from "@/components/ui";
import { useIdentityAsk } from "@/lib/identity";
import { bridge } from "@/lib/bridge";
import { useAuth } from "@/store/auth";

export function IdentityHost() {
  const ask = useIdentityAsk((s) => s.ask);
  const email = useAuth((s) => s.user?.email);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (ask) {
      setPw("");
      setError("");
      setBusy(false);
    }
  }, [ask]);
  const done = (ok: boolean) => {
    ask?.resolve(ok);
    useIdentityAsk.setState({ ask: null });
  };
  const check = async () => {
    if (!pw) return setError("Enter your password.");
    setBusy(true);
    setError("");
    const r = await bridge.auth.confirmPassword(pw);
    setBusy(false);
    if (r.ok) done(true);
    else {
      setError(r.message);
      setPw("");
    }
  };
  return (
    <Dialog
      open={!!ask}
      onClose={() => done(false)}
      width={420}
      icon={KeyRound}
      title="Confirm it's you"
      description={
        <>
          To approve <span className="text-text">{ask?.reason.replace(/^Approve: /, "")}</span>, enter the password for {email || "your account"}.
        </>
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => done(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={check}>
            Confirm and approve
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
      >
        <Input type="password" value={pw} onChange={setPw} placeholder="Your password" autoComplete="current-password" invalid={!!error} aria-label="Password" autoFocus />
        {error && <p className="mt-2 text-[12.5px] text-danger" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}
