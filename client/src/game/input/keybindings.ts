export type KeyBindings = {
  aimLeft: string;
  aimRight: string;
  powerUp: string;
  powerDown: string;
  shoot: string;
};

export const DEFAULT_KEYBINDINGS: KeyBindings = {
  aimLeft: "KeyA",
  aimRight: "KeyD",
  powerUp: "KeyW",
  powerDown: "KeyS",
  shoot: "Space"
};

const STORAGE_KEY = "eightball.keybindings";

export function loadKeyBindings(): KeyBindings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_KEYBINDINGS;
    const parsed = JSON.parse(raw) as Partial<KeyBindings>;
    return {
      aimLeft: parsed.aimLeft ?? DEFAULT_KEYBINDINGS.aimLeft,
      aimRight: parsed.aimRight ?? DEFAULT_KEYBINDINGS.aimRight,
      powerUp: parsed.powerUp ?? DEFAULT_KEYBINDINGS.powerUp,
      powerDown: parsed.powerDown ?? DEFAULT_KEYBINDINGS.powerDown,
      shoot: parsed.shoot ?? DEFAULT_KEYBINDINGS.shoot
    };
  } catch {
    return DEFAULT_KEYBINDINGS;
  }
}

export function saveKeyBindings(b: KeyBindings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    // ignore
  }
}

