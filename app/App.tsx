import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, type Health } from "./api";
import { Library } from "./Library";
import { Editor } from "./Editor";

/** Persistent banner when the studio server disappears mid-session — the
 *  cause of every « failed to fetch » — with the way back. */
export const OfflineBanner: React.FC = () => (
  <div className="offline-banner">
    ⚠ Le serveur studio (port 7788) ne répond plus — relance « La Bobine.command » ou{" "}
    <code>npm run studio</code>. Tes modifications locales seront resauvegardées dès son retour.
  </div>
);

export const App: React.FC = () => {
  const [health, setHealth] = useState<Health | null>(null);
  const [serverUp, setServerUp] = useState(true);
  const everReached = useRef(false);
  const [openId, setOpenId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("p"));

  // Watch the studio server: one ping at boot, then every 5 s.
  useEffect(() => {
    let stopped = false;
    const ping = async () => {
      try {
        const h = await api.health();
        if (stopped) return;
        everReached.current = true;
        setHealth(h);
        setServerUp(true);
      } catch {
        if (!stopped) setServerUp(false);
      }
    };
    void ping();
    const iv = setInterval(ping, 5000);
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, []);

  const open = useCallback((id: string | null) => {
    setOpenId(id);
    const url = id ? `?p=${id}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, []);

  if (!serverUp && !everReached.current) {
    return (
      <div className="library">
        <div className="masthead">
          <h1>
            La Bobine<span className="reel-dot">.</span>
          </h1>
        </div>
        <div className="onboarding" style={{ borderColor: "var(--danger)" }}>
          <div>
            <b>Le serveur studio ne répond pas.</b>
            <div className="hint" style={{ marginTop: 6 }}>
              Lance <code>npm run studio</code> dans <code>~/Claude/apps/la-bobine</code> (ou double-clique « La
              Bobine.command ») — il démarre le serveur (port 7788) et l'app ensemble. Cette page se reconnectera
              toute seule.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (openId) return <Editor id={openId} health={health} serverUp={serverUp} onClose={() => open(null)} />;
  return <Library health={health} serverUp={serverUp} onOpen={open} />;
};
