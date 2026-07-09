import React, { useCallback, useEffect, useState } from "react";
import { api, type Health } from "./api";
import { Library } from "./Library";
import { Editor } from "./Editor";

export const App: React.FC = () => {
  const [health, setHealth] = useState<Health | null>(null);
  const [serverDown, setServerDown] = useState(false);
  const [openId, setOpenId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("p"));

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setServerDown(true));
  }, []);

  const open = useCallback((id: string | null) => {
    setOpenId(id);
    const url = id ? `?p=${id}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, []);

  if (serverDown) {
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
              Lance <code>npm run studio</code> dans <code>~/Claude/apps/la-bobine</code> — il démarre le serveur (port
              7788) et l'app ensemble.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (openId) return <Editor id={openId} health={health} onClose={() => open(null)} />;
  return <Library health={health} onOpen={open} />;
};
