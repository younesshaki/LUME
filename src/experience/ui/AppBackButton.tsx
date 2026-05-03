import "./AppBackButton.css";

type AppBackButtonProps = {
  onClick: () => void;
  label?: string;
};

export function AppBackButton({ onClick, label = "Back" }: AppBackButtonProps) {
  return (
    <button className="appBackButton" type="button" onClick={onClick}>
      <span aria-hidden="true" className="appBackButton__arrow">←</span>
      <span>{label}</span>
    </button>
  );
}
