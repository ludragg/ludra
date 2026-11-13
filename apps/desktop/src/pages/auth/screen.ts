export type Screen =
  | { name: "login" }
  | { name: "register" }
  | { name: "verify"; email: string }
  | { name: "forgot" }
  | { name: "reset"; email: string };

export type Navigate = (screen: Screen) => void;
