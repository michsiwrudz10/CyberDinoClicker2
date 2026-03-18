import { useEffect, useState } from "react";

function readCompactLayout(maxWidth) {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= maxWidth;
}

export default function useCompactLayout(maxWidth = 560) {
  const [isCompact, setIsCompact] = useState(() => readCompactLayout(maxWidth));

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const sync = () => setIsCompact(mediaQuery.matches);

    sync();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", sync);
      return () => mediaQuery.removeEventListener("change", sync);
    }

    mediaQuery.addListener(sync);
    return () => mediaQuery.removeListener(sync);
  }, [maxWidth]);

  return isCompact;
}
