import { cn } from "@/lib/utils";
import "./loader.css";

type LoaderFourProps = {
  className?: string;
  text?: string;
};

type LoaderFiveProps = {
  className?: string;
  text?: string;
};

export function LoaderFour({ className, text = "Loading..." }: LoaderFourProps) {
  return (
    <div className={cn("loaderFour", className)} aria-hidden="true">
      <span className="loaderFour__track loaderFour__track--cyan">{text}</span>
      <span className="loaderFour__track loaderFour__track--red">{text}</span>
      <span className="loaderFour__track loaderFour__track--white">{text}</span>
    </div>
  );
}

export function LoaderFive({ className, text = "Generating chat..." }: LoaderFiveProps) {
  return (
    <div className={cn("loaderFive", className)} aria-hidden="true">
      {text.split("").map((character, index) => (
        <span
          className="loaderFive__letter"
          key={`${character}-${index}`}
          style={{ animationDelay: `${index * 42}ms` }}
        >
          {character === " " ? "\u00a0" : character}
        </span>
      ))}
    </div>
  );
}
