import { useEffect, useState } from "react";

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const isMac = window.desktop.platform === "darwin";

  useEffect(() => {
    let mounted = true;
    void window.desktop.windowControls.isMaximized().then((value) => {
      if (mounted) setIsMaximized(value);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (isMac) {
    return <div className="titlebar mac" />;
  }

  const toggleMaximize = async () => {
    await window.desktop.windowControls.maximize();
    const value = await window.desktop.windowControls.isMaximized();
    setIsMaximized(value);
  };

  return (
    <header className="titlebar" role="banner" aria-label="Window controls">
      <div className="titlebar__drag-region">
        <span className="titlebar__app-name">iReader by Pro Buyer</span>
      </div>
      <div className="titlebar__controls" role="group" aria-label="Window actions">
        <button type="button" onClick={() => void window.desktop.windowControls.minimize()} aria-label="Minimize">
          -
        </button>
        <button type="button" onClick={() => void toggleMaximize()} aria-label={isMaximized ? "Restore" : "Maximize"}>
          {isMaximized ? "[]" : "[ ]"}
        </button>
        <button type="button" className="danger" onClick={() => void window.desktop.windowControls.close()} aria-label="Close">
          x
        </button>
      </div>
    </header>
  );
}
