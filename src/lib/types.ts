// The recipe model. Every quantity is measured; every step is one action.

export type Unit = "g" | "kg" | "ml" | "L" | "tsp" | "tbsp" | "cup" | "pc";

export type Equipment =
  | "pressure_cooker"
  | "kadai"
  | "pan"
  | "tawa"
  | "saucepan"
  | "tadka_pan"
  | "mixer"
  | "chopper"
  | "knife"
  | "bowl"
  | "sieve"
  | "ladle";

export type StepKind =
  | "measure" // portion out ingredients before cooking
  | "chop" // knife or chopper work
  | "grind" // mixer grinder
  | "rinse" // wash dal/rice
  | "soak" // timed soak
  | "heat" // put a vessel on the flame
  | "flame" // change flame level only
  | "add" // put ingredients in
  | "stir" // stir for a duration
  | "wait" // cook without touching
  | "lid_close"
  | "lid_open"
  | "pressure" // cook for N whistles
  | "release" // let pressure drop naturally
  | "serve"
  | "note";

export type Flame = "off" | "low" | "medium" | "high";

export type Hue = "turmeric" | "chilli" | "leaf" | "tamarind" | "coconut";

export type Diet = "veg" | "vegan" | "jain" | "gluten_free" | "egg" | "non_veg";

export interface Ingredient {
  id: string; // kebab-case, unique within the recipe
  name: string; // "Toor dal"
  native?: string; // "Arhar dal" / "Thuvaram paruppu"
  qty: number; // total for the base servings
  unit: Unit;
  approx?: string; // "about 1 medium onion"
  group?: "main" | "spice" | "tempering" | "garnish" | "liquid";
  section?: string; // the source recipe's own grouping, e.g. "For the masala paste"
  estimated?: boolean; // the source was vague ("few", "to taste"); we picked a standard amount
  tag?: "oil" | "salt" | "chilli" | "sugar" | "carb" | "protein";
}

export interface StepItem {
  ingredient: string; // Ingredient.id
  qty: number;
  unit: Unit;
}

export interface Step {
  kind: StepKind;
  title: string; // imperative, ≤ 7 words: "Add the cumin seeds"
  detail?: string; // one short sentence, never a paragraph
  items?: StepItem[];
  durationSec?: number; // shows a timer
  flame?: Flame; // flame level during this step
  whistles?: number; // pressure steps
  equipment?: Equipment;
  cue?: string; // what "done" looks/smells/sounds like
  tip?: string;
}

export interface Recipe {
  id: string;
  name: string;
  native?: string; // name in the regional language
  region: "north" | "south" | "indo_chinese";
  /** Finer origin, for filters and search. */
  cuisine?: "tamil" | "kerala" | "karnataka" | "andhra" | "hyderabadi" | "punjabi" | "north" | "indo_chinese";
  course: "main" | "dal" | "rice" | "breakfast" | "side" | "drink" | "snack" | "dessert" | "bread" | "noodles" | "soup";
  kidFriendly?: boolean;
  /** Extra search words: other names and spellings ("kuzhambu", "kulambu", "gravy"). */
  tags?: string[];
  blurb: string; // one line
  servings: number;
  prepMin: number;
  cookMin: number;
  level: 1 | 2 | 3;
  spice: 1 | 2 | 3;
  diet: Diet[];
  hue: Hue;
  equipment: Equipment[];
  ingredients: Ingredient[];
  prep: Step[];
  cook: Step[];
  serveWith?: string;
  source?: { kind: "seed" | "youtube" | "ai"; url?: string; title?: string; channel?: string };
  variant?: string[]; // customisations applied, e.g. ["Low oil", "Kid friendly"]
  method?: "rules" | "ai"; // how an imported recipe was converted
  warnings?: string[]; // things the cook should double-check
  createdAt?: number;
  updatedAt?: number;
}
