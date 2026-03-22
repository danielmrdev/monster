"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type FontCategory = "sans-serif" | "serif" | "display" | "monospace";

export interface GoogleFont {
  name: string;
  category: FontCategory;
}

export const GOOGLE_FONTS: GoogleFont[] = [
  // System fonts (no Google Fonts request will be made for these)
  { name: "sans-serif", category: "sans-serif" },
  { name: "serif", category: "serif" },
  // Sans-serif
  { name: "Inter", category: "sans-serif" },
  { name: "Roboto", category: "sans-serif" },
  { name: "Open Sans", category: "sans-serif" },
  { name: "Lato", category: "sans-serif" },
  { name: "Montserrat", category: "sans-serif" },
  { name: "Poppins", category: "sans-serif" },
  { name: "Nunito", category: "sans-serif" },
  { name: "Source Sans 3", category: "sans-serif" },
  { name: "Raleway", category: "sans-serif" },
  { name: "DM Sans", category: "sans-serif" },
  { name: "Plus Jakarta Sans", category: "sans-serif" },
  { name: "Outfit", category: "sans-serif" },
  { name: "Figtree", category: "sans-serif" },
  { name: "Manrope", category: "sans-serif" },
  { name: "Work Sans", category: "sans-serif" },
  { name: "Barlow", category: "sans-serif" },
  { name: "IBM Plex Sans", category: "sans-serif" },
  { name: "Karla", category: "sans-serif" },
  { name: "Noto Sans", category: "sans-serif" },
  { name: "Mulish", category: "sans-serif" },
  { name: "Quicksand", category: "sans-serif" },
  { name: "Cabin", category: "sans-serif" },
  // Serif
  { name: "Playfair Display", category: "serif" },
  { name: "Merriweather", category: "serif" },
  { name: "Lora", category: "serif" },
  { name: "Cormorant Garamond", category: "serif" },
  { name: "DM Serif Display", category: "serif" },
  { name: "EB Garamond", category: "serif" },
  { name: "Libre Baskerville", category: "serif" },
  { name: "Crimson Text", category: "serif" },
  { name: "PT Serif", category: "serif" },
  { name: "Spectral", category: "serif" },
  // Display
  { name: "Oswald", category: "display" },
  { name: "Bebas Neue", category: "display" },
  { name: "Anton", category: "display" },
  { name: "Righteous", category: "display" },
  { name: "Cinzel", category: "display" },
  { name: "Josefin Sans", category: "display" },
  { name: "Abril Fatface", category: "display" },
  { name: "Pacifico", category: "display" },
  { name: "Teko", category: "display" },
  // Monospace
  { name: "JetBrains Mono", category: "monospace" },
  { name: "Fira Code", category: "monospace" },
  { name: "Source Code Pro", category: "monospace" },
  { name: "IBM Plex Mono", category: "monospace" },
];

const CATEGORY_COLORS: Record<FontCategory, string> = {
  "sans-serif": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  serif: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  display: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  monospace: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

export interface GoogleFontPickerProps {
  name: string;
  defaultValue?: string;
  label: string;
  id?: string;
}

export function GoogleFontPicker({ name, defaultValue = "", label, id }: GoogleFontPickerProps) {
  const [selectedValue, setSelectedValue] = React.useState<string>(defaultValue);
  const [inputText, setInputText] = React.useState<string>(defaultValue);
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const inputId = id ?? `font-picker-${name}`;

  const filtered = React.useMemo(
    () => GOOGLE_FONTS.filter((f) => f.name.toLowerCase().includes(inputText.toLowerCase())),
    [inputText],
  );

  // Close on outside click
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Revert input text to selected value if user typed but didn't pick
        setInputText(selectedValue);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, selectedValue]);

  function handleSelect(font: GoogleFont) {
    setSelectedValue(font.name);
    setInputText(font.name);
    setOpen(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputText(e.target.value);
    setOpen(true);
    // If user clears the input, clear the selected value too
    if (!e.target.value) {
      setSelectedValue("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      setInputText(selectedValue);
    } else if (e.key === "ArrowDown" && filtered.length > 0) {
      e.preventDefault();
      setOpen(true);
      const firstItem = listRef.current?.querySelector("[role=option]") as HTMLElement | null;
      firstItem?.focus();
    } else if (e.key === "Enter" && open && filtered.length === 1) {
      e.preventDefault();
      handleSelect(filtered[0]);
    }
  }

  function handleItemKeyDown(e: React.KeyboardEvent<HTMLLIElement>, font: GoogleFont) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSelect(font);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = e.currentTarget.nextElementSibling as HTMLElement | null;
      next?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = e.currentTarget.previousElementSibling as HTMLElement | null;
      if (prev) {
        prev.focus();
      } else {
        // Return focus to input
        (containerRef.current?.querySelector("input") as HTMLInputElement | null)?.focus();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setInputText(selectedValue);
      (containerRef.current?.querySelector("input") as HTMLInputElement | null)?.focus();
    }
  }

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <label htmlFor={inputId} className="text-sm font-medium leading-none">
        {label}
      </label>

      <div className="relative">
        {/* Hidden input for form submission */}
        <input type="hidden" name={name} value={selectedValue} />

        {/* Visible search input */}
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          value={inputText}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search fonts…"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${inputId}-list`}
          className={cn(
            "flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none transition-colors",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "placeholder:text-muted-foreground",
          )}
        />

        {/* Dropdown */}
        {open && filtered.length > 0 && (
          <ul
            id={`${inputId}-list`}
            ref={listRef}
            role="listbox"
            aria-label={label}
            className={cn(
              "absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg",
              "bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10",
              "py-1",
            )}
          >
            {filtered.map((font) => (
              <li
                key={font.name}
                role="option"
                tabIndex={0}
                aria-selected={selectedValue === font.name}
                onMouseDown={(e) => {
                  // Prevent blur before click registers
                  e.preventDefault();
                  handleSelect(font);
                }}
                onKeyDown={(e) => handleItemKeyDown(e, font)}
                className={cn(
                  "flex items-center justify-between px-2.5 py-1.5 text-sm cursor-default select-none outline-none",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus:bg-accent focus:text-accent-foreground",
                  selectedValue === font.name && "bg-accent/50 font-medium",
                )}
              >
                <span>{font.name}</span>
                <span
                  className={cn(
                    "ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                    CATEGORY_COLORS[font.category],
                  )}
                >
                  {font.category}
                </span>
              </li>
            ))}
          </ul>
        )}

        {open && filtered.length === 0 && (
          <div
            className={cn(
              "absolute z-50 mt-1 w-full rounded-lg px-2.5 py-3 text-sm text-muted-foreground",
              "bg-popover shadow-md ring-1 ring-foreground/10",
            )}
          >
            No fonts match &ldquo;{inputText}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}
