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
import { useTheme } from "next-themes";

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
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { THEME_ANIMATIONS, useThemeAnimation } from "@/components/theme-animation";
import { cn } from "@/lib/utils";

export function AppearanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { variant, setVariant } = useThemeAnimation();
  const { resolvedTheme, setTheme } = useTheme();
  const currentTheme = resolvedTheme === "light" ? "light" : "dark";

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
          Tip: Chrome on macOS shows a circle reveal for every shape to keep the
          transition flash-free.
        </p>

        <DialogFooter className="sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AnimatedThemeToggler
              theme={currentTheme}
              onThemeChange={setTheme}
              variant={variant}
              duration={350}
              className="inline-flex size-9 items-center justify-center rounded-md border bg-background text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4"
            />
            <span>Try it</span>
          </div>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
