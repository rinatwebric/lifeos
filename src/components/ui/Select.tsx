import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  type ChangeEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/cn";

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "value" | "defaultValue" | "onChange" | "size" | "multiple"
> {
  invalid?: boolean;
  /** Width/position classes for the trigger wrapper, not the popup. */
  containerClassName?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  "data-autofocus"?: boolean;
  children: ReactNode;
}

interface OptionItem {
  value: string;
  label: ReactNode;
  disabled: boolean;
}

function collectOptions(children: ReactNode): OptionItem[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return [];
    if (child.type === Fragment) {
      return collectOptions((child.props as { children?: ReactNode }).children);
    }
    if (child.type !== "option") return [];
    const props = child.props as {
      value?: string | number;
      disabled?: boolean;
      children?: ReactNode;
    };
    return [
      {
        value: props.value === undefined ? String(props.children ?? "") : String(props.value),
        label: props.children,
        disabled: Boolean(props.disabled),
      },
    ];
  });
}

/**
 * A real listbox, not a native `<select>` with a painted trigger. The native
 * element stays in the DOM as the form value (so react-hook-form and reset()
 * keep working); the visible surface, keyboard model and option list follow
 * the app's neutral palette instead of the OS blue.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    invalid,
    className,
    containerClassName,
    value,
    defaultValue,
    onChange,
    onBlur,
    children,
    disabled,
    name,
    required,
    form,
    id,
    "aria-describedby": describedBy,
    "aria-invalid": ariaInvalid,
    "aria-label": ariaLabel,
    "data-autofocus": dataAutofocus,
    ...rest
  },
  forwardedRef,
) {
  const options = useMemo(() => collectOptions(children), [children]);
  const nativeRef = useRef<HTMLSelectElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const initialValue = value ?? defaultValue ?? options[0]?.value ?? "";
  const [selected, setSelected] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [position, setPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight?: number;
    mobile?: boolean;
  } | null>(null);

  const setRefs = useCallback(
    (node: HTMLSelectElement | null) => {
      nativeRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  // The native select is the form value. It can be changed by react-hook-form's
  // reset() without a React state update, so adopt its DOM value on every render.
  useLayoutEffect(() => {
    const native = nativeRef.current;
    if (!native) return;
    if (value !== undefined) {
      if (native.value !== value) native.value = value;
      if (selected !== value) setSelected(value);
    } else if (native.value !== selected) {
      setSelected(native.value);
    }
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    const update = (): void => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      if (window.innerWidth < 640) {
        setPosition({
          left: 16,
          bottom: 16,
          width: window.innerWidth - 32,
          mobile: true,
        });
        return;
      }
      const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 16);
      // Native dialogs clip fixed descendants at their own edge. Use the
      // nearest dialog as the boundary, not just the viewport, and flip the
      // list up when the room below is smaller than a comfortable menu.
      const dialog = trigger.closest("dialog");
      const boundaryBottom = dialog
        ? Math.min(window.innerHeight, dialog.getBoundingClientRect().bottom)
        : window.innerHeight;
      const spaceBelow = boundaryBottom - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const openUp = spaceBelow < 320 && spaceAbove > spaceBelow;
      const maxHeight = Math.min(288, Math.max(120, openUp ? spaceAbove : spaceBelow));
      const left = Math.max(
        8,
        Math.min(
          rect.right - width < 8 ? rect.left : rect.right - width,
          window.innerWidth - width - 8,
        ),
      );
      setPosition(
        openUp
          ? { bottom: window.innerHeight - rect.top + 8, left, width, maxHeight }
          : {
              top: Math.min(rect.bottom + 8, boundaryBottom - 8),
              left,
              width,
              maxHeight,
            },
      );
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[data-active="true"]');
    if (list && active) {
      list.scrollTop = Math.max(
        0,
        active.offsetTop - list.clientHeight / 2 + active.clientHeight / 2,
      );
    }
  }, [open]);

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === selected),
  );
  const selectedOption = options.find((option) => option.value === selected);

  const choose = (option: OptionItem, index: number): void => {
    if (option.disabled) return;
    setSelected(option.value);
    if (nativeRef.current) nativeRef.current.value = option.value;
    setHighlighted(index);
    setOpen(false);
    triggerRef.current?.focus();
    onChange?.({
      target: { name, value: option.value },
      currentTarget: { name, value: option.value },
    } as unknown as ChangeEvent<HTMLSelectElement>);
  };

  const openList = (): void => {
    setHighlighted(selectedIndex);
    const trigger = triggerRef.current;
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      setPosition(
        window.innerWidth < 640
          ? { left: 16, bottom: 16, width: window.innerWidth - 32, mobile: true }
          : {
              top: Math.min(rect.bottom + 8, window.innerHeight - 8),
              left: rect.left,
              width: rect.width,
            },
      );
    }
    setOpen(true);
  };

  const move = (delta: number): void => {
    if (options.length === 0) return;
    let next = highlighted;
    for (let step = 1; step <= options.length; step += 1) {
      next = (next + delta + options.length) % options.length;
      if (!options[next]?.disabled) break;
    }
    setHighlighted(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openList();
        setHighlighted(selectedIndex);
      } else {
        move(event.key === "ArrowDown" ? 1 : -1);
      }
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      if (!open) return;
      event.preventDefault();
      setHighlighted(event.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        openList();
      } else {
        const option = options[highlighted];
        if (option) choose(option, highlighted);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
    if (event.key === "Tab") setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn("relative min-w-0", containerClassName ?? "w-full")}>
      <select
        ref={setRefs}
        name={name}
        form={form}
        required={required}
        disabled={disabled}
        defaultValue={initialValue}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        {...rest}
      >
        {children}
      </select>

      <button
        ref={triggerRef}
        type="button"
        id={id}
        data-autofocus={dataAutofocus}
        data-value={selected}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${listboxId}-option-${highlighted}` : undefined}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={ariaInvalid || invalid || undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
        onBlur={onBlur as unknown as React.FocusEventHandler<HTMLButtonElement>}
        className={cn(
          "flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-control border bg-surface px-3 text-left text-base text-content transition-[border-color,background-color] duration-fast ease-standard",
          "sm:text-ui",
          "hover:border-muted",
          "focus:border-content",
          "disabled:cursor-not-allowed disabled:opacity-60",
          invalid ? "border-danger" : "border-control",
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{selectedOption?.label ?? ""}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted transition-transform duration-fast ease-standard",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open && position ? (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          style={{
            top: position.top,
            bottom: position.bottom,
            left: position.left,
            width: position.width,
            maxHeight: position.mobile ? undefined : position.maxHeight,
          }}
          className={cn(
            "scrollbar-neutral fixed z-[60] overflow-y-auto rounded-card border border-line bg-surface p-1 shadow-overlay",
            position.mobile ? "max-h-[min(60dvh,24rem)]" : "max-h-72",
          )}
        >
          {options.map((option, index) => {
            const active = index === highlighted;
            const selectedOptionItem = option.value === selected;
            return (
              <div
                key={`${option.value}-${index}`}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={selectedOptionItem}
                aria-disabled={option.disabled || undefined}
                data-value={option.value}
                data-active={active || undefined}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => choose(option, index)}
                className={cn(
                  "flex min-h-9 cursor-pointer items-center justify-between gap-2 rounded-control px-2.5 py-1.5 text-ui transition-colors",
                  option.disabled
                    ? "cursor-not-allowed text-muted opacity-50"
                    : active
                      ? "bg-surface-muted text-content"
                      : "text-content hover:bg-surface-muted",
                )}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {selectedOptionItem ? (
                  <Check className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});
