import React from "react";

const ResizeHandle = ({ onDrag, className = "" }) => {
  const startDrag = (clientX) => {
    let lastX = clientX;

    const onMove = (ev) => {
      const delta = ev.clientX - lastX;
      lastX = ev.clientX;
      onDrag(delta);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize"
      onMouseDown={(e) => {
        e.preventDefault();
        startDrag(e.clientX);
      }}
      className={`group relative z-10 w-1 shrink-0 cursor-col-resize touch-none
      hover:bg-violet-500/40 active:bg-violet-500/60 transition-colors
      ${className}`}
    >
      <span
        className="absolute inset-y-0 -left-1 -right-1"
        aria-hidden
      />
    </div>
  );
};

export default ResizeHandle;
