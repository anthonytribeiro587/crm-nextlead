"use client";

import { CSSProperties, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type SelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

export function SmartSelect({
  value,
  options,
  onChange,
  placeholder = "Selecione",
  disabled = false,
  className = "",
  ariaLabel,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value && !option.disabled);

  function updateMenuPosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const gutter = 10;
    const preferredMaxHeight = Math.min(320, Math.floor(viewportHeight * 0.46));
    const spaceBelow = viewportHeight - rect.bottom - gutter;
    const spaceAbove = rect.top - gutter;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(preferredMaxHeight, openUp ? spaceAbove - 8 : spaceBelow - 8));
    const top = openUp ? Math.max(gutter, rect.top - maxHeight - 8) : Math.min(viewportHeight - gutter, rect.bottom + 8);
    const width = Math.min(Math.max(rect.width, 220), viewportWidth - gutter * 2);
    const left = Math.min(Math.max(gutter, rect.left), viewportWidth - width - gutter);

    setMenuPosition({ top, left, width, maxHeight });
  }

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, value, options.length]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.(`[data-smart-select-menu="${listboxId}"]`)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function handleReposition() {
      updateMenuPosition();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, listboxId]);

  const menu = open && !disabled && mounted && menuPosition
    ? createPortal(
        <div
          className="smart-select-menu smart-select-menu-portal"
          id={listboxId}
          role="listbox"
          data-smart-select-menu={listboxId}
          style={
            {
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
              width: `${menuPosition.width}px`,
              maxHeight: `${menuPosition.maxHeight}px`,
            } as CSSProperties
          }
        >
          {options.map((option) => (
            <button
              key={`${option.value}-${option.label}`}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "selected" : ""}
              disabled={option.disabled}
              onClick={() => {
                if (option.disabled) return;
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.description && <small>{option.description}</small>}
            </button>
          ))}
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={rootRef} className={`smart-select ${className} ${open ? "open" : ""} ${disabled ? "disabled" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="smart-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel || placeholder}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label || placeholder}</span>
        <i aria-hidden="true">⌄</i>
      </button>
      {menu}
    </div>
  );
}
