import React from "react";

const ConfirmModal = ({
  open,
  title = "Confirm",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!loading) onCancel?.();
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#15151d] text-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <div className="border-b border-white/10 px-5 py-4">
          <h2 id="confirm-modal-title" className="text-lg font-semibold">
            {title}
          </h2>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-gray-300 leading-relaxed">{message}</p>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={onCancel}
              className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-gray-300 hover:bg-white/5 disabled:opacity-60"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={onConfirm}
              className={`flex-1 rounded-xl py-2.5 text-sm font-medium disabled:opacity-60 ${
                danger
                  ? "bg-red-600 hover:bg-red-500"
                  : "bg-violet-600 hover:bg-violet-500"
              }`}
            >
              {loading ? "Please wait..." : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
