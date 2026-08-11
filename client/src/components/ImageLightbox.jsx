import React, { useEffect, useMemo, useState } from "react";

const ImageLightbox = ({ src, images, startIndex = 0, onClose }) => {
  const gallery = useMemo(() => {
    if (Array.isArray(images) && images.length) {
      return images.filter(Boolean);
    }
    return src ? [src] : [];
  }, [images, src]);

  const [current, setCurrent] = useState(startIndex);
  const total = gallery.length;
  const hasGallery = total > 1;
  const activeSrc = (src && (gallery[current] || src)) || null;

  useEffect(() => {
    if (!src) return;
    const idxInGallery = gallery.indexOf(src);
    const next =
      idxInGallery >= 0
        ? idxInGallery
        : Math.min(Math.max(0, startIndex), Math.max(0, total - 1));
    setCurrent(next);
  }, [startIndex, src, total]);

  useEffect(() => {
    if (!src || !activeSrc) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
      if (!hasGallery) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrent((i) => (i - 1 + total) % total);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrent((i) => (i + 1) % total);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [src, activeSrc, hasGallery, total, onClose]);

  if (!src || !activeSrc) return null;

  const goPrev = (e) => {
    e.stopPropagation();
    setCurrent((i) => (i - 1 + total) % total);
  };

  const goNext = (e) => {
    e.stopPropagation();
    setCurrent((i) => (i + 1) % total);
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close image"
        className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center"
        onClick={onClose}
      >
        ✕
      </button>

      {hasGallery && (
        <p className="absolute top-5 left-1/2 -translate-x-1/2 z-20 rounded-full bg-black/50 px-3 py-1 text-xs text-white/90">
          {current + 1} / {total}
        </p>
      )}

      {hasGallery && (
        <button
          type="button"
          aria-label="Previous image"
          onClick={goPrev}
          className="absolute left-3 sm:left-6 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/25"
        >
          ‹
        </button>
      )}

      <img
        src={activeSrc}
        alt="Full size"
        className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {hasGallery && (
        <button
          type="button"
          aria-label="Next image"
          onClick={goNext}
          className="absolute right-3 sm:right-6 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/25"
        >
          ›
        </button>
      )}
    </div>
  );
};

export default ImageLightbox;
