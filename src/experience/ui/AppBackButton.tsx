import { useSound } from "../../lib/sound";
import "./AppBackButton.css";

type AppBackButtonProps = {
  onClick: () => void;
  label?: string;
};

export function AppBackButton({ onClick, label = "Back" }: AppBackButtonProps) {
  const { play } = useSound();

  return (
    <button
      className="appBackButton"
      type="button"
      onMouseEnter={() => play("nav.hover")}
      onClick={onClick}
    >
      <span aria-hidden="true" className="appBackButton__arrow">←</span>
      <span>{label}</span>
    </button>
  );
}
