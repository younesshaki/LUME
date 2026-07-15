"use client";

/**
 * "Appearance" settings dialog — lets the signed-in admin choose which shape
 * the light/dark theme toggle animates with. The choice is a per-user
 * localStorage preference managed by `ThemeAnimationProvider`.
 *
 * The dialog doubles as a live preview: the toggle inside it runs the currently
 * selected animation against the real theme, so picking a shape and pressing it
 * shows exactly what the header toggle will do.
 */
import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { THEME_ANIMATIONS, useThemeAnimation } from "@/components/theme-animation";
import { THEME_TOGGLE_ELEMENT_ID } from "@/components/admin-shell-ids";
import { cn } from "@/lib/utils";

export function AppearanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { variant, setVariant } = useThemeAnimation();

  // Preview by closing the dialog, then triggering the real header toggle so
  // the reveal plays over the actual app — never inside the modal (a
  // full-screen reveal fired from within a modal can wedge Radix's body
  // pointer-events lock, which made the toggle unresponsive until refresh).
  const previewAnimation = React.useCallback(() => {
    onOpenChange(false);
    window.setTimeout(() => {
      const toggle = document.getElementById(THEME_TOGGLE_ELEMENT_ID);
      if (toggle instanceof HTMLElement) toggle.click();
    }, 160);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Appearance</DialogTitle>
          <DialogDescription>
            Choose how the light/dark toggle animates. Saved to this browser.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={variant}
          onValueChange={(value) => setVariant(value as typeof variant)}
          className="gap-1"
        >
          {THEME_ANIMATIONS.map((option) => (
            <Label
              key={option.value}
              htmlFor={`theme-animation-${option.value}`}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:bg-muted/60",
                variant === option.value && "border-border bg-muted/60",
              )}
            >
              <RadioGroupItem
                id={`theme-animation-${option.value}`}
                value={option.value}
                className="mt-0.5"
              />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium leading-none">{option.label}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </Label>
          ))}
        </RadioGroup>

        <p className="text-xs text-muted-foreground">
          Tip: press “Try it” to preview the animation on the live theme toggle.
        </p>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" onClick={previewAnimation}>
            Try it
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
