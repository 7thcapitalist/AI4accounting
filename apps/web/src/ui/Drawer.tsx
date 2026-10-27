import { type ReactNode, useEffect } from "react";

/** Side panel shared by client, phase and agent details. Escape or the backdrop closes it. */
export function Drawer({
  label,
  onClose,
  head,
  children,
  foot,
}: {
  label: string;
  onClose: () => void;
  head: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button type="button" className="scrim" aria-label="Fechar" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={label}>
        <div className="drawer-head">
          <button type="button" className="drawer-x" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
          {head}
        </div>
        <div className="drawer-body">{children}</div>
        {foot && <div className="drawer-foot">{foot}</div>}
      </div>
    </>
  );
}
